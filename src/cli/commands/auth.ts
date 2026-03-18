import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import readline from 'readline';
import { createClient, getClient, getConfigDir, getEnvPath } from '../../client.js';
import { grabSlackSession } from '../chrome-cookies.js';

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

export const authCommand = new Command('auth').description('Authentication management');

authCommand
  .command('login')
  .description('Login via Slack desktop app session (auto-detects all workspaces)')
  .option('-w, --workspace <name>', 'Workspace name to connect')
  .action(async (opts) => {
    console.log(chalk.dim('Reading Slack desktop app session...'));
    const session = grabSlackSession();

    if (!session) {
      console.log(chalk.red('No Slack desktop app found or no active session.'));
      console.log(chalk.dim('Make sure the Slack app is installed and you are logged in.'));
      console.log(chalk.dim('Or use: postcli-slack auth setup'));
      process.exit(1);
    }

    console.log(chalk.dim(`Found ${session.tokens.length} token(s). Detecting workspaces...\n`));

    // Resolve each token to its workspace via auth.test
    const resolved: { token: string; user: string; team: string }[] = [];
    for (const token of session.tokens) {
      try {
        const client = createClient(token, session.cookie, 'slack');
        const auth = await client.authTest();
        resolved.push({ token, user: auth.user, team: auth.team });
        console.log(`  ${chalk.bold(auth.team)} (@${auth.user})`);
      } catch {
        // expired token, skip
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
      if (match) {
        selected = match;
      } else {
        console.log(chalk.red(`\nWorkspace "${opts.workspace}" not found.`));
        process.exit(1);
      }
    } else if (resolved.length > 1) {
      console.log();
      resolved.forEach((r, i) => console.log(`  ${i + 1}. ${r.team} (@${r.user})`));
      const choice = await ask('\nSelect workspace (number): ');
      const idx = parseInt(choice) - 1;
      if (resolved[idx]) selected = resolved[idx];
    }

    saveCredentials(selected.token, session.cookie, 'slack');
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
