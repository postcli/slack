import { Command } from 'commander';
import chalk from 'chalk';
import { getClient } from '../../client.js';

export const usersCommand = new Command('users').description('List and inspect users');

usersCommand
  .command('list')
  .description('List users in the workspace')
  .option('-l, --limit <n>', 'Max users to show', '50')
  .option('--bots', 'Include bot users')
  .action(async function (this: Command, opts) {
    const json = this.optsWithGlobals().json;
    const client = getClient();
    let users = await client.listUsers();

    if (!opts.bots) {
      users = users.filter((u) => !u.isBot && !u.deleted);
    }

    const limited = users.slice(0, parseInt(opts.limit));

    if (json) {
      console.log(JSON.stringify(limited.map((u) => u.toData()), null, 2));
    } else {
      for (const u of limited) {
        const role = u.isAdmin ? chalk.yellow(' [admin]') : '';
        const title = u.title ? chalk.dim(` - ${u.title}`) : '';
        console.log(`${chalk.bold(u.displayName)} (@${u.name})${role}${title}`);
      }
      console.log(chalk.dim(`\n${limited.length} of ${users.length} users`));
    }
  });

usersCommand
  .command('info <user>')
  .description('Get user details by ID or username')
  .action(async function (this: Command, user: string) {
    const json = this.optsWithGlobals().json;
    const client = getClient();

    let userId = user;
    if (!user.startsWith('U') && !user.startsWith('W')) {
      const users = await client.listUsers();
      const found = users.find((u) => u.name === user.replace('@', ''));
      if (!found) {
        console.error(chalk.red(`User "${user}" not found`));
        process.exit(1);
      }
      userId = found.id;
    }

    const u = await client.getUserInfo(userId);

    if (json) {
      console.log(JSON.stringify(u.toData(), null, 2));
    } else {
      console.log(`${chalk.bold(u.displayName)} (@${u.name})`);
      console.log(`ID: ${u.id}`);
      if (u.title) console.log(`Title: ${u.title}`);
      if (u.email) console.log(`Email: ${u.email}`);
      if (u.statusText) console.log(`Status: ${u.statusEmoji ?? ''} ${u.statusText}`);
      console.log(`Admin: ${u.isAdmin}`);
    }
  });
