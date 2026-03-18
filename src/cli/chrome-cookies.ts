import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import crypto from 'crypto';
import Database from 'better-sqlite3';

// ── Paths ──────────────────────────────────────────────────

const SLACK_APP_PATHS = [
  join(homedir(), '.var/app/com.slack.Slack/config/Slack'),
  join(homedir(), '.config/Slack'),
  join(homedir(), 'snap/slack/common/.config/Slack'),
  join(homedir(), 'Library/Application Support/Slack'),
];

const CHROME_COOKIE_PATHS = [
  join(homedir(), '.config/google-chrome/Default/Cookies'),
  join(homedir(), '.config/google-chrome/Profile 1/Cookies'),
  join(homedir(), '.config/chromium/Default/Cookies'),
  join(homedir(), 'Library/Application Support/Google/Chrome/Default/Cookies'),
];

// ── Types ──────────────────────────────────────────────────

export interface SlackSessionResult {
  cookie: string;
  tokens: string[];
}

// ── Main entry point ───────────────────────────────────────

/**
 * Extract Slack session from the desktop app.
 * Reads xoxc- tokens from LevelDB and the d= cookie from SQLite.
 */
export function grabSlackSession(): SlackSessionResult | null {
  const slackDir = SLACK_APP_PATHS.find((p) => existsSync(p));
  if (!slackDir) return null;

  // Extract tokens from LevelDB
  const leveldbDir = join(slackDir, 'Local Storage/leveldb');
  const tokens = extractTokens(leveldbDir);
  if (!tokens.length) return null;

  // Extract d= cookie
  const cookiePath = join(slackDir, 'Cookies');
  const cookie = existsSync(cookiePath)
    ? extractCookie(cookiePath, true)
    : extractCookieFromChrome();

  if (!cookie) return null;

  return { cookie, tokens };
}

// ── Token extraction from LevelDB ─────────────────────────

function extractTokens(leveldbDir: string): string[] {
  if (!existsSync(leveldbDir)) return [];

  try {
    const files = readdirSync(leveldbDir)
      .filter((f) => f.endsWith('.ldb') || f.endsWith('.log'))
      .map((f) => join(leveldbDir, f));

    const seen = new Set<string>();

    for (const file of files) {
      try {
        const buf = readFileSync(file);
        // Scan for xoxc- tokens in the binary data
        const needle = Buffer.from('xoxc-');
        let pos = 0;

        while (true) {
          const idx = buf.indexOf(needle, pos);
          if (idx === -1) break;
          pos = idx + 1;

          // Read the token: xoxc- followed by hex chars and dashes
          const tokenBytes: number[] = [];
          for (let i = idx; i < buf.length && tokenBytes.length < 200; i++) {
            const b = buf[i];
            if ((b >= 0x30 && b <= 0x39) || // 0-9
                (b >= 0x41 && b <= 0x5a) || // A-Z
                (b >= 0x61 && b <= 0x7a) || // a-z
                b === 0x2d) {               // -
              tokenBytes.push(b);
            } else {
              break;
            }
          }

          const token = Buffer.from(tokenBytes).toString('ascii');
          if (token.startsWith('xoxc-') && token.length > 50) {
            seen.add(token);
          }
        }
      } catch {
        // file read failed
      }
    }

    return [...seen];
  } catch {
    return [];
  }
}

// ── Cookie extraction ──────────────────────────────────────

function extractCookie(dbPath: string, isSlackApp: boolean): string | null {
  const key = getEncryptionKey(isSlackApp);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  try {
    const rows = db.prepare(
      `SELECT encrypted_value, value FROM cookies
       WHERE host_key LIKE '%slack.com' AND name = 'd'
       ORDER BY expires_utc DESC LIMIT 1`
    ).all() as { encrypted_value: Buffer; value: string }[];

    if (!rows.length) return null;
    return decrypt(rows[0].encrypted_value, key) || rows[0].value || null;
  } finally {
    db.close();
  }
}

function extractCookieFromChrome(): string | null {
  for (const path of CHROME_COOKIE_PATHS) {
    if (!existsSync(path)) continue;
    const cookie = extractCookie(path, false);
    if (cookie) return cookie;
  }
  return null;
}

// ── Encryption ─────────────────────────────────────────────

function getEncryptionKey(isSlackApp: boolean): Buffer {
  const isMac = process.platform === 'darwin';

  if (isMac) {
    const service = isSlackApp ? 'Slack Safe Storage' : 'Chrome Safe Storage';
    try {
      const password = execSync(
        `security find-generic-password -s "${service}" -w`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      return crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
    } catch {
      return crypto.pbkdf2Sync('peanuts', 'saltysalt', 1003, 16, 'sha1');
    }
  }

  const lookupApp = isSlackApp ? 'Slack' : 'chrome';
  try {
    const password = execSync(`secret-tool lookup application ${lookupApp}`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    return crypto.pbkdf2Sync(password, 'saltysalt', 1, 16, 'sha1');
  } catch {
    return crypto.pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');
  }
}

function decrypt(encryptedValue: Buffer, key: Buffer): string {
  if (encryptedValue.length === 0) return '';

  const prefix = encryptedValue.subarray(0, 3).toString('ascii');
  if (prefix !== 'v10' && prefix !== 'v11') {
    return encryptedValue.toString('utf-8');
  }

  const data = encryptedValue.subarray(3);
  const iv = Buffer.alloc(16, 0x20);

  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(true);
  const raw = Buffer.concat([decipher.update(data), decipher.final()]);
  const decrypted = raw.toString('latin1').replace(/[\x00-\x1f]+$/g, '');

  const xoxdIdx = decrypted.indexOf('xoxd-');
  if (xoxdIdx !== -1) return decrypted.substring(xoxdIdx);

  const sessionIdx = decrypted.indexOf('s%3A');
  if (sessionIdx !== -1) return decrypted.substring(sessionIdx);

  return decrypted;
}
