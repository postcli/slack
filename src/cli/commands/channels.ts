import { Command } from 'commander';
import chalk from 'chalk';
import { getClient } from '../../client.js';

export const channelsCommand = new Command('channels').description('List and inspect channels');

channelsCommand
  .command('list')
  .description('List channels in the workspace')
  .option('-l, --limit <n>', 'Max channels to return', '50')
  .option('-a, --all', 'Include archived channels')
  .action(async function (this: Command, opts) {
    const json = this.optsWithGlobals().json;
    const client = getClient();
    const channels = await client.listChannels({
      excludeArchived: !opts.all,
    });

    const limited = channels.slice(0, parseInt(opts.limit));

    if (json) {
      console.log(JSON.stringify(limited.map((c) => c.toData()), null, 2));
    } else {
      for (const c of limited) {
        const prefix = c.isPrivate ? chalk.yellow('private') : chalk.green('public');
        const members = chalk.dim(`(${c.memberCount} members)`);
        const archived = c.isArchived ? chalk.red(' [archived]') : '';
        console.log(`${prefix} #${chalk.bold(c.name)} ${members}${archived}`);
        if (c.topic) console.log(chalk.dim(`  ${c.topic}`));
      }
      console.log(chalk.dim(`\n${limited.length} of ${channels.length} channels`));
    }
  });

channelsCommand
  .command('info <channel>')
  .description('Get channel details by name or ID')
  .action(async function (this: Command, channel: string) {
    const json = this.optsWithGlobals().json;
    const client = getClient();
    const channels = await client.listChannels();
    const found = channels.find(
      (c) => c.name === channel.replace('#', '') || c.id === channel
    );

    if (!found) {
      console.error(chalk.red(`Channel "${channel}" not found`));
      process.exit(1);
    }

    if (json) {
      console.log(JSON.stringify(found.toData(), null, 2));
    } else {
      console.log(`${chalk.bold('#' + found.name)} (${found.id})`);
      console.log(`Members: ${found.memberCount}`);
      console.log(`Private: ${found.isPrivate}`);
      if (found.topic) console.log(`Topic: ${found.topic}`);
      if (found.purpose) console.log(`Purpose: ${found.purpose}`);
      console.log(`Created: ${found.created.toISOString()}`);
    }
  });
