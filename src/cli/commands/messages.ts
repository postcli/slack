import { Command } from 'commander';
import chalk from 'chalk';
import { getClient } from '../../client.js';

export const messagesCommand = new Command('messages').description('Read messages and threads');

messagesCommand
  .command('history <channel>')
  .description('Get message history from a channel')
  .option('-l, --limit <n>', 'Max messages to return', '20')
  .action(async function (this: Command, channel: string, opts) {
    const json = this.optsWithGlobals().json;
    const client = getClient();

    // Resolve channel name to ID if needed
    let channelId = channel;
    if (!channel.startsWith('C') && !channel.startsWith('D') && !channel.startsWith('G')) {
      const channels = await client.listChannels();
      const found = channels.find((c) => c.name === channel.replace('#', ''));
      if (!found) {
        console.error(chalk.red(`Channel "${channel}" not found`));
        process.exit(1);
      }
      channelId = found.id;
    }

    const messages = await client.getMessages(channelId, { limit: parseInt(opts.limit) });

    if (json) {
      console.log(JSON.stringify(messages.map((m) => m.toData()), null, 2));
    } else {
      for (const m of messages.reverse()) {
        const time = chalk.dim(m.date.toISOString().slice(0, 16).replace('T', ' '));
        const thread = m.hasThread ? chalk.cyan(` [${m.replyCount} replies]`) : '';
        console.log(`${time} ${chalk.bold(m.user)}: ${m.text}${thread}`);
      }
    }
  });

messagesCommand
  .command('thread <channel> <thread_ts>')
  .description('Get all replies in a thread')
  .action(async function (this: Command, channel: string, threadTs: string) {
    const json = this.optsWithGlobals().json;
    const client = getClient();

    // Resolve channel name to ID if needed
    let channelId = channel;
    if (!channel.startsWith('C') && !channel.startsWith('D') && !channel.startsWith('G')) {
      const channels = await client.listChannels();
      const found = channels.find((c) => c.name === channel.replace('#', ''));
      if (!found) {
        console.error(chalk.red(`Channel "${channel}" not found`));
        process.exit(1);
      }
      channelId = found.id;
    }

    const thread = await client.getThread(channelId, threadTs);

    if (json) {
      console.log(JSON.stringify(thread.toData(), null, 2));
    } else {
      const pt = thread.parent;
      console.log(chalk.bold(`Thread started by ${pt.user}:`));
      console.log(`${pt.text}\n`);
      for (const r of thread.replies) {
        const time = chalk.dim(r.date.toISOString().slice(0, 16).replace('T', ' '));
        console.log(`  ${time} ${chalk.bold(r.user)}: ${r.text}`);
      }
      console.log(chalk.dim(`\n${thread.replies.length} replies`));
    }
  });
