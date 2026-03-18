import { z } from 'zod';
import { getClient } from '../client.js';

export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  handler: (args: any) => Promise<string>;
}

function json(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

export const tools: ToolDef[] = [
  {
    name: 'test_connection',
    description: 'Test Slack authentication',
    schema: z.object({}),
    handler: async () => {
      const client = getClient();
      const auth = await client.authTest();
      return json({ ok: true, user: auth.user, team: auth.team });
    },
  },
  {
    name: 'list_channels',
    description: 'List channels in the Slack workspace',
    schema: z.object({
      include_archived: z.boolean().optional().default(false).describe('Include archived channels'),
    }),
    handler: async ({ include_archived }) => {
      const client = getClient();
      const channels = await client.listChannels({ excludeArchived: !include_archived });
      return json(channels.map((c) => c.toData()));
    },
  },
  {
    name: 'get_messages',
    description: 'Get message history from a Slack channel',
    schema: z.object({
      channel: z.string().describe('Channel name (without #) or channel ID'),
      limit: z.number().optional().default(20).describe('Max messages to return'),
    }),
    handler: async ({ channel, limit }) => {
      const client = getClient();

      let channelId = channel;
      if (!channel.startsWith('C') && !channel.startsWith('D') && !channel.startsWith('G')) {
        const channels = await client.listChannels();
        const found = channels.find((c) => c.name === channel.replace('#', ''));
        if (!found) throw new Error(`Channel "${channel}" not found`);
        channelId = found.id;
      }

      const messages = await client.getMessages(channelId, { limit });
      return json(messages.map((m) => m.toData()));
    },
  },
  {
    name: 'get_thread',
    description: 'Get all replies in a Slack thread',
    schema: z.object({
      channel: z.string().describe('Channel name or ID'),
      thread_ts: z.string().describe('Thread timestamp (ts of the parent message)'),
    }),
    handler: async ({ channel, thread_ts }) => {
      const client = getClient();

      let channelId = channel;
      if (!channel.startsWith('C') && !channel.startsWith('D') && !channel.startsWith('G')) {
        const channels = await client.listChannels();
        const found = channels.find((c) => c.name === channel.replace('#', ''));
        if (!found) throw new Error(`Channel "${channel}" not found`);
        channelId = found.id;
      }

      const thread = await client.getThread(channelId, thread_ts);
      return json(thread.toData());
    },
  },
  {
    name: 'list_users',
    description: 'List users in the Slack workspace',
    schema: z.object({
      include_bots: z.boolean().optional().default(false).describe('Include bot users'),
    }),
    handler: async ({ include_bots }) => {
      const client = getClient();
      let users = await client.listUsers();
      if (!include_bots) {
        users = users.filter((u) => !u.isBot && !u.deleted);
      }
      return json(users.map((u) => u.toData()));
    },
  },
  {
    name: 'get_user',
    description: 'Get details for a specific Slack user',
    schema: z.object({
      user: z.string().describe('User ID or username (without @)'),
    }),
    handler: async ({ user }) => {
      const client = getClient();

      let userId = user;
      if (!user.startsWith('U') && !user.startsWith('W')) {
        const users = await client.listUsers();
        const found = users.find((u) => u.name === user.replace('@', ''));
        if (!found) throw new Error(`User "${user}" not found`);
        userId = found.id;
      }

      const u = await client.getUserInfo(userId);
      return json(u.toData());
    },
  },
  {
    name: 'search_messages',
    description: 'Search messages across all channels in the workspace',
    schema: z.object({
      query: z.string().describe('Search query (supports Slack search syntax: from:user, in:channel, etc.)'),
      limit: z.number().optional().default(20).describe('Max results'),
    }),
    handler: async ({ query, limit }) => {
      const client = getClient();
      const result = await client.searchMessages(query, { count: limit });
      return json({
        total: result.total,
        messages: result.messages.map((m) => m.toData()),
      });
    },
  },

  // ── Write tools ──────────────────────────────────────────

  {
    name: 'post_message',
    description: 'Post a message to a Slack channel',
    schema: z.object({
      channel: z.string().describe('Channel name (without #) or channel ID'),
      text: z.string().describe('Message text (supports Slack markdown)'),
    }),
    handler: async ({ channel, text }) => {
      const client = getClient();
      const channelId = await client.resolveChannel(channel);
      const msg = await client.postMessage(channelId, text);
      return json({ ok: true, ts: msg.ts, channel: channelId });
    },
  },
  {
    name: 'reply_to_thread',
    description: 'Reply to a thread in a Slack channel',
    schema: z.object({
      channel: z.string().describe('Channel name or ID'),
      thread_ts: z.string().describe('Thread timestamp (ts of the parent message)'),
      text: z.string().describe('Reply text'),
    }),
    handler: async ({ channel, thread_ts, text }) => {
      const client = getClient();
      const channelId = await client.resolveChannel(channel);
      const msg = await client.replyToThread(channelId, thread_ts, text);
      return json({ ok: true, ts: msg.ts });
    },
  },
  {
    name: 'edit_message',
    description: 'Edit a message you posted',
    schema: z.object({
      channel: z.string().describe('Channel name or ID'),
      ts: z.string().describe('Timestamp of the message to edit'),
      text: z.string().describe('New message text'),
    }),
    handler: async ({ channel, ts, text }) => {
      const client = getClient();
      const channelId = await client.resolveChannel(channel);
      await client.updateMessage(channelId, ts, text);
      return json({ ok: true });
    },
  },
  {
    name: 'delete_message',
    description: 'Delete a message you posted',
    schema: z.object({
      channel: z.string().describe('Channel name or ID'),
      ts: z.string().describe('Timestamp of the message to delete'),
    }),
    handler: async ({ channel, ts }) => {
      const client = getClient();
      const channelId = await client.resolveChannel(channel);
      await client.deleteMessage(channelId, ts);
      return json({ ok: true });
    },
  },
  {
    name: 'add_reaction',
    description: 'Add a reaction (emoji) to a message',
    schema: z.object({
      channel: z.string().describe('Channel name or ID'),
      ts: z.string().describe('Message timestamp'),
      emoji: z.string().describe('Emoji name without colons (e.g. "thumbsup", "eyes", "+1")'),
    }),
    handler: async ({ channel, ts, emoji }) => {
      const client = getClient();
      const channelId = await client.resolveChannel(channel);
      await client.addReaction(channelId, ts, emoji);
      return json({ ok: true, emoji });
    },
  },
  {
    name: 'remove_reaction',
    description: 'Remove a reaction from a message',
    schema: z.object({
      channel: z.string().describe('Channel name or ID'),
      ts: z.string().describe('Message timestamp'),
      emoji: z.string().describe('Emoji name without colons'),
    }),
    handler: async ({ channel, ts, emoji }) => {
      const client = getClient();
      const channelId = await client.resolveChannel(channel);
      await client.removeReaction(channelId, ts, emoji);
      return json({ ok: true });
    },
  },
  {
    name: 'set_status',
    description: 'Set your Slack status',
    schema: z.object({
      text: z.string().describe('Status text (e.g. "In a meeting")'),
      emoji: z.string().optional().describe('Status emoji (e.g. ":coffee:")'),
      duration_minutes: z.number().optional().describe('Auto-clear after N minutes'),
    }),
    handler: async ({ text, emoji, duration_minutes }) => {
      const client = getClient();
      const expiration = duration_minutes
        ? Math.floor(Date.now() / 1000) + duration_minutes * 60
        : undefined;
      await client.setStatus(text, emoji, expiration);
      return json({ ok: true, status: text });
    },
  },
  {
    name: 'pin_message',
    description: 'Pin a message in a channel',
    schema: z.object({
      channel: z.string().describe('Channel name or ID'),
      ts: z.string().describe('Message timestamp'),
    }),
    handler: async ({ channel, ts }) => {
      const client = getClient();
      const channelId = await client.resolveChannel(channel);
      await client.pinMessage(channelId, ts);
      return json({ ok: true });
    },
  },
  {
    name: 'mark_read',
    description: 'Mark a channel as read up to a specific message',
    schema: z.object({
      channel: z.string().describe('Channel name or ID'),
      ts: z.string().describe('Timestamp to mark as read up to'),
    }),
    handler: async ({ channel, ts }) => {
      const client = getClient();
      const channelId = await client.resolveChannel(channel);
      await client.markRead(channelId, ts);
      return json({ ok: true });
    },
  },
];
