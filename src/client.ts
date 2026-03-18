import { SlackClient } from './lib/slack.js';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { homedir } from 'os';

export function getConfigDir(): string {
  return resolve(homedir(), '.config', 'postcli');
}

export function getEnvPath(): string {
  return resolve(getConfigDir(), '.env');
}

// Load from ~/.config/postcli/.env (primary) and also from cwd/.env (fallback for dev)
const configEnvPath = getEnvPath();
if (existsSync(configEnvPath)) {
  dotenv.config({ path: configEnvPath });
} else {
  const __filename = fileURLToPath(import.meta.url);
  const projectRoot = resolve(dirname(__filename), '..');
  dotenv.config({ path: resolve(projectRoot, '.env') });
}

let _client: SlackClient | null = null;

export function getClient(): SlackClient {
  if (_client) return _client;

  const token = process.env.SLACK_TOKEN;
  const cookie = process.env.SLACK_COOKIE;
  const workspace = process.env.SLACK_WORKSPACE;

  if (!token || !cookie || !workspace) {
    throw new Error(
      'Missing SLACK_TOKEN, SLACK_COOKIE or SLACK_WORKSPACE. Run: postcli-slack auth login'
    );
  }

  _client = new SlackClient({ token, cookie, workspace });
  return _client;
}

export function createClient(token: string, cookie: string, workspace: string): SlackClient {
  return new SlackClient({ token, cookie, workspace });
}
