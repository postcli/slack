import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import readline from 'readline';
import { createClient, getClient, getConfigDir, getEnvPath } from '../../client.js';
import { grabSlackCookies } from '../chrome-cookies.js';

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (answer) => { rl.close(); res(answer.trim()); }));
}

function saveCredentials(token: string, cookie: string, workspace: string) {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }
  const envPath = getEnvPath();
  let envContent = '';
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf-8');
    envContent = envContent
      .replace(/^SLACK_TOKEN=.*$/m, '')
      .replace(/^SLACK_COOKIE=.*$/m, '')
      .replace(/^SLACK_WORKSPACE=.*$/m, '')
      .trim();
    if (envContent) envContent += '\n';
  }
  envContent += `SLACK_TOKEN=${token}\nSLACK_COOKIE=${cookie}\nSLACK_WORKSPACE=${workspace}\n`;
  writeFileSync(envPath, envContent, { mode: 0o600 });
}

async function bootstrapToken(cookie: string, workspace: string): Promise<string> {
  // Use the d= cookie to call Slack's internal API and get the xoxc- token
  // This mirrors what the Slack web client does on page load
  const res = await fetch(`https://${workspace}.slack.com/api/client.boot`, {
    method: 'POST',
    headers: {
      Cookie: `d=${cookie}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    body: new URLSearchParams({ _x_reason: 'postcli-bootstrap', _x_sonic: 'true' }).toString(),
  });

  if (!res.ok) {
    throw new Error(`Failed to bootstrap token: HTTP ${res.status}`);
  }

  const data = await res.json() as any;
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error ?? 'unknown'}`);
  }

  const token = data.self?.token ?? data.api_token;
  if (!token?.startsWith('xoxc-')) {
    throw new Error('Could not extract xoxc- token from client.boot response');
  }

  return token;
}

export const authCommand = new Command('auth').description('Authentication management');

authCommand
  .command('login')
  .description('Login via Chrome cookies (must be logged into Slack in Chrome)')
  .option('-w, --workspace <name>', 'Workspace to connect (e.g. "apache" from apache.slack.com)')
  .action(async (opts) => {
    console.log(chalk.dim('Checking Chrome for existing Slack session...'));
    const grabbed = grabSlackCookies();

    if (!grabbed) {
      console.log(chalk.red('No Slack session found in Chrome.'));
      console.log(chalk.dim('Log into Slack in Chrome first, then try again.'));
      console.log(chalk.dim('Or use: postcli-slack auth setup'));
      process.exit(1);
    }

    // Try existing tokens from LocalStorage first
    console.log(chalk.dim(`Found ${grabbed.tokens.length} token(s) from LocalStorage. Detecting workspaces...`));

    const resolved: { token: string; user: string; team: string; url: string }[] = [];
    for (const token of grabbed.tokens) {
      try {
        const client = createClient(token, grabbed.cookie, 'slack');
        const auth = await client.authTest();
        resolved.push({ token, user: auth.user, team: auth.team, url: '' });
        console.log(chalk.dim(`  ${auth.team} (@${auth.user})`));
      } catch {
        // token expired or invalid, skip
      }
    }

    // If workspace flag is set and not found in existing tokens, bootstrap from cookie
    if (opts.workspace && !resolved.find((r) => r.team.toLowerCase().includes(opts.workspace.toLowerCase()))) {
      console.log(chalk.dim(`\nWorkspace "${opts.workspace}" not found in cached tokens. Bootstrapping via cookie...`));
      try {
        const token = await bootstrapToken(grabbed.cookie, opts.workspace);
        const client = createClient(token, grabbed.cookie, 'slack');
        const auth = await client.authTest();
        resolved.push({ token, user: auth.user, team: auth.team, url: '' });
        console.log(chalk.dim(`  ${auth.team} (@${auth.user})`));
      } catch (err: any) {
        console.log(chalk.dim(`  Bootstrap failed: ${err.message}`));
      }
    }

    // If still no tokens, try bootstrapping from known workspace cookies
    if (!resolved.length && grabbed.workspaces.length) {
      console.log(chalk.dim(`\nNo valid tokens. Bootstrapping from ${grabbed.workspaces.length} workspace(s)...`));
      for (const ws of grabbed.workspaces) {
        try {
          const token = await bootstrapToken(grabbed.cookie, ws);
          const client = createClient(token, grabbed.cookie, 'slack');
          const auth = await client.authTest();
          resolved.push({ token, user: auth.user, team: auth.team, url: '' });
          console.log(chalk.dim(`  ${auth.team} (@${auth.user})`));
        } catch {
          // skip failed workspaces
        }
      }
    }

    if (!resolved.length) {
      console.log(chalk.red('All tokens are expired. Re-open Slack desktop and try again.'));
      process.exit(1);
    }

    let selected = resolved[0];
    if (opts.workspace) {
      const match = resolved.find((r) =>
        r.team.toLowerCase().includes(opts.workspace.toLowerCase())
      );
      if (match) selected = match;
    } else if (resolved.length > 1) {
      console.log('\nAvailable workspaces:');
      resolved.forEach((r, i) => console.log(`  ${i + 1}. ${r.team} (@${r.user})`));
      const choice = await ask('\nSelect workspace (number): ');
      const idx = parseInt(choice) - 1;
      if (resolved[idx]) selected = resolved[idx];
    }

    // Extract workspace subdomain from the team URL via auth.test
    const client = createClient(selected.token, grabbed.cookie, 'slack');
    const fullAuth = await client.authTest();
    // We need the workspace subdomain for future API calls
    // auth.test doesn't return it directly, but we can use slack.com/api/ which works without subdomain
    const workspace = 'slack'; // use generic endpoint, token handles routing

    saveCredentials(selected.token, grabbed.cookie, workspace);
    console.log(chalk.green(`\nConnected as ${chalk.bold(selected.user)} in workspace ${chalk.bold(selected.team)}`));
    console.log(chalk.green('Credentials saved to .env'));
  });

authCommand
  .command('setup')
  .description('Configure credentials manually (paste token and cookie from browser DevTools)')
  .action(async () => {
    console.log(chalk.bold('Slack Manual Auth Setup\n'));
    console.log('1. Open Slack in your browser');
    console.log('2. DevTools (F12) > Network tab');
    console.log('3. Find any request to /api/ and copy:');
    console.log('   - token: xoxc-... (from request body)');
    console.log('   - d=... cookie value (from Cookie header)\n');

    const workspace = await ask('Workspace name (e.g. "apache" from apache.slack.com): ');
    const token = await ask('Token (xoxc-...): ');
    const cookie = await ask('Cookie d= value: ');

    if (!token.startsWith('xoxc-')) {
      console.log(chalk.red('Token must start with xoxc-'));
      process.exit(1);
    }

    console.log(chalk.dim('\nTesting connection...'));
    try {
      const client = createClient(token, cookie, workspace);
      const auth = await client.authTest();
      saveCredentials(token, cookie, workspace);
      console.log(chalk.green(`\nConnected as ${chalk.bold(auth.user)} in workspace ${chalk.bold(auth.team)}`));
      console.log(chalk.green('Credentials saved to .env'));
    } catch (err: any) {
      console.log(chalk.red(`Connection failed: ${err.message}`));
      console.log(chalk.dim('Credentials were NOT saved.'));
    }
  });

authCommand
  .command('test')
  .description('Test current connection')
  .action(async () => {
    try {
      const client = getClient();
      const auth = await client.authTest();
      console.log(chalk.green(`Connected as ${chalk.bold(auth.user)} in workspace ${chalk.bold(auth.team)}`));
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

authCommand
  .command('logout')
  .description('Remove stored Slack credentials')
  .action(async () => {
    const envPath = getEnvPath();
    if (!existsSync(envPath)) {
      console.log(chalk.dim('No credentials found.'));
      return;
    }

    const content = readFileSync(envPath, 'utf-8');
    if (!content.includes('SLACK_TOKEN')) {
      console.log(chalk.dim('No Slack credentials found.'));
      return;
    }

    const cleaned = content
      .split('\n')
      .filter((line) =>
        !line.startsWith('SLACK_TOKEN=') &&
        !line.startsWith('SLACK_COOKIE=') &&
        !line.startsWith('SLACK_WORKSPACE=')
      )
      .join('\n')
      .trim();

    if (cleaned) {
      writeFileSync(envPath, cleaned + '\n', { mode: 0o600 });
    } else {
      unlinkSync(envPath);
    }

    console.log(chalk.green('Slack credentials removed.'));
  });
