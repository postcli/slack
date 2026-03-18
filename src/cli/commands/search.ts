import { Command } from 'commander';
import chalk from 'chalk';
import { getClient } from '../../client.js';

export const searchCommand = new Command('search').description('Search messages');

searchCommand
  .command('messages <query>')
  .description('Search messages across channels')
  .option('-l, --limit <n>', 'Max results', '20')
  .option('--sort <field>', 'Sort by: score or timestamp', 'timestamp')
  .action(async function (this: Command, query: string, opts) {
    const json = this.optsWithGlobals().json;
    const client = getClient();
    const result = await client.searchMessages(query, {
      count: parseInt(opts.limit),
      sort: opts.sort as 'score' | 'timestamp',
    });

    if (json) {
      console.log(JSON.stringify({
        total: result.total,
        messages: result.messages.map((m) => m.toData()),
      }, null, 2));
    } else {
      console.log(chalk.dim(`${result.total} results for "${query}"\n`));
      for (const m of result.messages) {
        const time = chalk.dim(m.date.toISOString().slice(0, 16).replace('T', ' '));
        console.log(`${time} ${chalk.bold(m.user)}: ${m.text}`);
      }
    }
  });
