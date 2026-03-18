import { Command } from 'commander';
import chalk from 'chalk';
import { getClient } from '../../client.js';

export const postCommand = new Command('post').description('Post messages, reply, react');

postCommand
  .command('send <channel> <text>')
  .description('Post a message to a channel')
  .action(async function (this: Command, channel: string, text: string) {
    const json = this.optsWithGlobals().json;
    const client = getClient();
    const channelId = await client.resolveChannel(channel);
    const msg = await client.postMessage(channelId, text);

    if (json) {
      console.log(JSON.stringify(msg.toData(), null, 2));
    } else {
      console.log(chalk.green(`Message sent to #${channel} (ts: ${msg.ts})`));
    }
  });

postCommand
  .command('reply <channel> <thread_ts> <text>')
  .description('Reply to a thread')
  .action(async function (this: Command, channel: string, threadTs: string, text: string) {
    const json = this.optsWithGlobals().json;
    const client = getClient();
    const channelId = await client.resolveChannel(channel);
    const msg = await client.replyToThread(channelId, threadTs, text);

    if (json) {
      console.log(JSON.stringify(msg.toData(), null, 2));
    } else {
      console.log(chalk.green(`Reply sent (ts: ${msg.ts})`));
    }
  });

postCommand
  .command('edit <channel> <ts> <text>')
  .description('Edit a message')
  .action(async function (this: Command, channel: string, ts: string, text: string) {
    const client = getClient();
    const channelId = await client.resolveChannel(channel);
    await client.updateMessage(channelId, ts, text);
    console.log(chalk.green('Message updated.'));
  });

postCommand
  .command('delete <channel> <ts>')
  .description('Delete a message')
  .action(async function (this: Command, channel: string, ts: string) {
    const client = getClient();
    const channelId = await client.resolveChannel(channel);
    await client.deleteMessage(channelId, ts);
    console.log(chalk.green('Message deleted.'));
  });

postCommand
  .command('react <channel> <ts> <emoji>')
  .description('Add a reaction to a message (e.g. "thumbsup", "+1", "eyes")')
  .action(async function (this: Command, channel: string, ts: string, emoji: string) {
    const client = getClient();
    const channelId = await client.resolveChannel(channel);
    await client.addReaction(channelId, ts, emoji);
    console.log(chalk.green(`Reacted with :${emoji.replace(/:/g, '')}:`));
  });

postCommand
  .command('unreact <channel> <ts> <emoji>')
  .description('Remove a reaction from a message')
  .action(async function (this: Command, channel: string, ts: string, emoji: string) {
    const client = getClient();
    const channelId = await client.resolveChannel(channel);
    await client.removeReaction(channelId, ts, emoji);
    console.log(chalk.green(`Removed :${emoji.replace(/:/g, '')}:`));
  });

postCommand
  .command('pin <channel> <ts>')
  .description('Pin a message')
  .action(async function (this: Command, channel: string, ts: string) {
    const client = getClient();
    const channelId = await client.resolveChannel(channel);
    await client.pinMessage(channelId, ts);
    console.log(chalk.green('Message pinned.'));
  });

postCommand
  .command('star <channel> <ts>')
  .description('Star a message')
  .action(async function (this: Command, channel: string, ts: string) {
    const client = getClient();
    const channelId = await client.resolveChannel(channel);
    await client.starMessage(channelId, ts);
    console.log(chalk.green('Message starred.'));
  });
