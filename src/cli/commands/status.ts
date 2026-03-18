import { Command } from 'commander';
import chalk from 'chalk';
import { getClient } from '../../client.js';

export const statusCommand = new Command('status').description('Set your status and presence');

statusCommand
  .command('set <text>')
  .description('Set your status (e.g. "In a meeting")')
  .option('-e, --emoji <emoji>', 'Status emoji (e.g. ":coffee:")')
  .option('-d, --duration <minutes>', 'Auto-clear after N minutes')
  .action(async function (this: Command, text: string, opts) {
    const client = getClient();
    const expiration = opts.duration
      ? Math.floor(Date.now() / 1000) + parseInt(opts.duration) * 60
      : undefined;
    await client.setStatus(text, opts.emoji, expiration);
    const emoji = opts.emoji ?? '';
    console.log(chalk.green(`Status set: ${emoji} ${text}`));
  });

statusCommand
  .command('clear')
  .description('Clear your status')
  .action(async () => {
    const client = getClient();
    await client.setStatus('', '');
    console.log(chalk.green('Status cleared.'));
  });

statusCommand
  .command('away')
  .description('Set yourself as away')
  .action(async () => {
    const client = getClient();
    await client.setPresence('away');
    console.log(chalk.green('Set to away.'));
  });

statusCommand
  .command('active')
  .description('Set yourself as active')
  .action(async () => {
    const client = getClient();
    await client.setPresence('auto');
    console.log(chalk.green('Set to active.'));
  });
