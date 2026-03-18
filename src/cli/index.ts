#!/usr/bin/env node
import { Command } from 'commander';
import { authCommand } from './commands/auth.js';
import { channelsCommand } from './commands/channels.js';
import { messagesCommand } from './commands/messages.js';
import { usersCommand } from './commands/users.js';
import { searchCommand } from './commands/search.js';
import { postCommand } from './commands/post.js';
import { statusCommand } from './commands/status.js';

// Handle --mcp before commander parses (MCP server stays alive, no subcommand needed)
if (process.argv.includes('--mcp')) {
  import('../mcp/index.js').then(({ startMcpServer }) => startMcpServer()).catch((err) => {
    console.error('MCP server failed:', err);
    process.exit(1);
  });
} else {
  const program = new Command()
    .name('postcli-slack')
    .description('Slack CLI and MCP Server')
    .version(process.env.npm_package_version || '0.1.0')
    .option('-j, --json', 'Output as JSON (for scripts and AI agents)')
    .enablePositionalOptions()
    .passThroughOptions();

  program.addCommand(authCommand);
  program.addCommand(channelsCommand);
  program.addCommand(messagesCommand);
  program.addCommand(usersCommand);
  program.addCommand(searchCommand);
  program.addCommand(postCommand);
  program.addCommand(statusCommand);

  program.parse();
}
