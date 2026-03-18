import { Command } from 'commander';
import { authCommand } from './cli/commands/auth.js';
import { channelsCommand } from './cli/commands/channels.js';
import { messagesCommand } from './cli/commands/messages.js';
import { usersCommand } from './cli/commands/users.js';
import { searchCommand } from './cli/commands/search.js';
import { postCommand } from './cli/commands/post.js';
import { statusCommand } from './cli/commands/status.js';
import { startMcpServer } from './mcp/index.js';

export function registerCommands(program: Command): void {
  const slack = new Command('slack')
    .description('Slack - channels, messages, threads, users, search, post, react')
    .option('-j, --json', 'Output as JSON (for scripts and AI agents)')
    .enablePositionalOptions()
    .passThroughOptions();

  slack.addCommand(authCommand);
  slack.addCommand(channelsCommand);
  slack.addCommand(messagesCommand);
  slack.addCommand(usersCommand);
  slack.addCommand(searchCommand);
  slack.addCommand(postCommand);
  slack.addCommand(statusCommand);

  program.addCommand(slack);
}

export { startMcpServer };
