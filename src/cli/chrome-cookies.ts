import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import crypto from 'crypto';
import Database from 'better-sqlite3';

const COOKIE_PATHS = [
  // Slack desktop app (Flatpak)
  join(homedir(), '.var/app/com.slack.Slack/config/Slack/Cookies'),
  // Slack desktop app (native/deb/rpm)
  join(homedir(), '.config/Slack/Cookies'),
  // Slack desktop app (snap)
  join(homedir(), 'snap/slack/common/.config/Slack/Cookies'),
  // Chrome browser (Linux)
  join(homedir(), '.config/google-chrome/Default/Cookies'),
  join(homedir(), '.config/google-chrome/Profile 1/Cookies'),
  join(homedir(), '.config/chromium/Default/Cookies'),
  // Chrome browser (macOS)
  join(homedir(), 'Library/Application Support/Google/Chrome/Default/Cookies'),
  join(homedir(), 'Library/Application Support/Google/Chrome/Profile 1/Cookies'),
  // Slack desktop app (macOS)
  join(homedir(), 'Library/Application Support/Slack/Cookies'),
];

const CHROME_LOCALSTORAGE_PATHS = [
  // Linux
  join(homedir(), '.config/google-chrome/Default/Local Storage/leveldb'),
  join(homedir(), '.config/google-chrome/Profile 1/Local Storage/leveldb'),
  // macOS
  join(homedir(), 'Library/Application Support/Google/Chrome/Default/Local Storage/leveldb'),
  join(homedir(), 'Library/Application Support/Google/Chrome/Profile 1/Local Storage/leveldb'),
];

function findCookieDb(): { path: string; isSlackApp: boolean } | null {
  for (const p of COOKIE_PATHS) {
    if (existsSync(p)) {
      const isSlackApp = p.includes('/Slack/');
      return { path: p, isSlackApp };
    }
  }
  return null;
}

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

  // Linux: Slack desktop stores key as 'Slack' (capital S), Chrome as 'chrome'
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

  // Decode as latin1 (binary-safe) since CBC first block has IV garbage
  const decrypted = raw.toString('latin1').replace(/[\x00-\x1f]+$/g, '');

  // Slack d= cookie starts with xoxd-; Chrome cookies start with s%3A
  // Extract from the known prefix to skip CBC first-block garbage
  const xoxdIdx = decrypted.indexOf('xoxd-');
  if (xoxdIdx !== -1) return decrypted.substring(xoxdIdx);

  const sessionIdx = decrypted.indexOf('s%3A');
  if (sessionIdx !== -1) return decrypted.substring(sessionIdx);

  return decrypted;
}

export interface SlackChromeResult {
  cookie: string;
  tokens: string[];
  workspaces: string[];
}

export function grabSlackCookies(): SlackChromeResult | null {
  const found = findCookieDb();
  if (!found) return null;

  const key = getEncryptionKey(found.isSlackApp);
  const db = new Database(found.path, { readonly: true, fileMustExist: true });

  try {
    // Slack uses a single "d" cookie for all workspaces on .slack.com
    const rows = db.prepare(
      `SELECT name, encrypted_value, value, host_key FROM cookies
       WHERE host_key LIKE '%slack.com'
       AND name = 'd'
       ORDER BY expires_utc DESC
       LIMIT 1`
    ).all() as { name: string; encrypted_value: Buffer; value: string; host_key: string }[];

    if (!rows.length) return null;

    const cookie = decrypt(rows[0].encrypted_value, key) || rows[0].value;
    if (!cookie) return null;

    // Find workspace subdomains from other slack cookies
    const workspaceRows = db.prepare(
      `SELECT DISTINCT host_key FROM cookies
       WHERE host_key LIKE '%.slack.com'
       AND host_key NOT LIKE '%app.slack.com'
       AND host_key NOT LIKE '%edgeapi.slack.com'
       AND host_key != '.slack.com'`
    ).all() as { host_key: string }[];

    const workspaces = workspaceRows
      .map((r) => r.host_key.replace(/^\./, '').replace('.slack.com', ''))
      .filter((w) => w && !w.includes('.'));

    const tokens = findTokensFromLevelDb();
    return { cookie, tokens, workspaces };
  } finally {
    db.close();
  }
}

const LEVELDB_PATHS = [
  // Slack desktop (Flatpak)
  join(homedir(), '.var/app/com.slack.Slack/config/Slack/Local Storage/leveldb'),
  // Slack desktop (native)
  join(homedir(), '.config/Slack/Local Storage/leveldb'),
  // Slack desktop (snap)
  join(homedir(), 'snap/slack/common/.config/Slack/Local Storage/leveldb'),
  // Slack desktop (macOS)
  join(homedir(), 'Library/Application Support/Slack/Local Storage/leveldb'),
];

/**
 * Extract xoxc- tokens from Slack's LevelDB LocalStorage.
 * LevelDB .ldb files contain plaintext token strings we can grep for.
 */
export function findTokensFromLevelDb(): string[] {

  for (const dir of [...LEVELDB_PATHS, ...CHROME_LOCALSTORAGE_PATHS]) {
    if (!existsSync(dir)) continue;

    try {
      const output = execSync(
        `strings "${dir}"/*.ldb "${dir}"/*.log 2>/dev/null | grep -o 'xoxc-[a-zA-Z0-9_-]*' | sort -u`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();

      if (output) {
        return output.split('\n').filter((t) => t.startsWith('xoxc-'));
      }
    } catch {
      // strings/grep failed, skip
    }
  }

  return [];
}
