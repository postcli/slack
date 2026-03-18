import { HttpClient, type HttpClientConfig } from './http.js';
import { Channel, Message, User, Thread } from './models.js';
import type { SlackApiResponse, SlackChannel, SlackMessage, SlackUser } from '../types.js';

export interface SlackClientConfig {
  token: string;
  cookie: string;
  workspace: string;
  maxRequestsPerSecond?: number;
}

interface AuthTestResponse extends SlackApiResponse {
  user_id: string;
  user: string;
  team_id: string;
  team: string;
  url: string;
  is_enterprise_install: boolean;
}

interface ConversationsListResponse extends SlackApiResponse {
  channels: SlackChannel[];
}

interface ConversationsHistoryResponse extends SlackApiResponse {
  messages: SlackMessage[];
  has_more: boolean;
}

interface ConversationsRepliesResponse extends SlackApiResponse {
  messages: SlackMessage[];
  has_more: boolean;
}

interface UsersListResponse extends SlackApiResponse {
  members: SlackUser[];
}

interface SearchMessagesResponse extends SlackApiResponse {
  messages: {
    matches: (SlackMessage & { channel: { id: string; name: string } })[];
    total: number;
  };
}

export class SlackClient {
  private http: HttpClient;

  constructor(config: SlackClientConfig) {
    this.http = new HttpClient({
      token: config.token,
      cookie: config.cookie,
      workspace: config.workspace,
      maxRequestsPerSecond: config.maxRequestsPerSecond,
    });
  }

  async testConnectivity(): Promise<boolean> {
    try {
      await this.authTest();
      return true;
    } catch {
      return false;
    }
  }

  async authTest(): Promise<{ userId: string; user: string; teamId: string; team: string }> {
    const res = await this.http.post<AuthTestResponse>('auth.test');
    return { userId: res.user_id, user: res.user, teamId: res.team_id, team: res.team };
  }

  async listChannels(options?: {
    types?: string;
    limit?: number;
    excludeArchived?: boolean;
  }): Promise<Channel[]> {
    const { types = 'public_channel,private_channel', limit = 200, excludeArchived = true } =
      options ?? {};
    const channels: Channel[] = [];

    for await (const page of this.http.paginate<ConversationsListResponse>(
      'conversations.list',
      { types, limit, exclude_archived: excludeArchived }
    )) {
      channels.push(...page.channels.map((c) => new Channel(c)));
    }

    return channels;
  }

  async getMessages(channelId: string, options?: {
    limit?: number;
    oldest?: string;
    latest?: string;
  }): Promise<Message[]> {
    const { limit = 100, oldest, latest } = options ?? {};
    const messages: Message[] = [];

    for await (const page of this.http.paginate<ConversationsHistoryResponse>(
      'conversations.history',
      { channel: channelId, limit: Math.min(limit, 200), oldest, latest }
    )) {
      messages.push(...page.messages.map((m) => new Message(m)));
      if (messages.length >= limit) break;
    }

    return messages.slice(0, limit);
  }

  async getThread(channelId: string, threadTs: string): Promise<Thread> {
    const messages: Message[] = [];

    for await (const page of this.http.paginate<ConversationsRepliesResponse>(
      'conversations.replies',
      { channel: channelId, ts: threadTs, limit: 200 }
    )) {
      messages.push(...page.messages.map((m) => new Message(m)));
    }

    const parent = messages[0];
    const replies = messages.slice(1);
    return new Thread(parent, replies);
  }

  async listUsers(options?: { limit?: number }): Promise<User[]> {
    const { limit = 200 } = options ?? {};
    const users: User[] = [];

    for await (const page of this.http.paginate<UsersListResponse>(
      'users.list',
      { limit }
    )) {
      users.push(...page.members.map((u) => new User(u)));
    }

    return users;
  }

  async getUserInfo(userId: string): Promise<User> {
    const res = await this.http.post<SlackApiResponse & { user: SlackUser }>(
      'users.info',
      { user: userId }
    );
    return new User(res.user);
  }

  async searchMessages(query: string, options?: {
    count?: number;
    sort?: 'score' | 'timestamp';
    sortDir?: 'asc' | 'desc';
  }): Promise<{ messages: Message[]; total: number }> {
    const { count = 20, sort = 'timestamp', sortDir = 'desc' } = options ?? {};
    const res = await this.http.post<SearchMessagesResponse>('search.messages', {
      query,
      count,
      sort,
      sort_dir: sortDir,
    });
    return {
      messages: res.messages.matches.map((m) => new Message(m)),
      total: res.messages.total,
    };
  }

  // ── Write operations ──────────────────────────────────────

  /** Post a message to a channel */
  async postMessage(channelId: string, text: string): Promise<Message> {
    const res = await this.http.post<SlackApiResponse & { message: SlackMessage }>(
      'chat.postMessage',
      { channel: channelId, text }
    );
    return new Message(res.message);
  }

  /** Reply to a thread */
  async replyToThread(channelId: string, threadTs: string, text: string): Promise<Message> {
    const res = await this.http.post<SlackApiResponse & { message: SlackMessage }>(
      'chat.postMessage',
      { channel: channelId, text, thread_ts: threadTs }
    );
    return new Message(res.message);
  }

  /** Edit a message */
  async updateMessage(channelId: string, ts: string, text: string): Promise<void> {
    await this.http.post('chat.update', { channel: channelId, ts, text });
  }

  /** Delete a message */
  async deleteMessage(channelId: string, ts: string): Promise<void> {
    await this.http.post('chat.delete', { channel: channelId, ts });
  }

  /** Add a reaction (emoji) to a message */
  async addReaction(channelId: string, ts: string, emoji: string): Promise<void> {
    await this.http.post('reactions.add', {
      channel: channelId,
      timestamp: ts,
      name: emoji.replace(/:/g, ''),
    });
  }

  /** Remove a reaction from a message */
  async removeReaction(channelId: string, ts: string, emoji: string): Promise<void> {
    await this.http.post('reactions.remove', {
      channel: channelId,
      timestamp: ts,
      name: emoji.replace(/:/g, ''),
    });
  }

  /** Set the channel topic */
  async setTopic(channelId: string, topic: string): Promise<void> {
    await this.http.post('conversations.setTopic', { channel: channelId, topic });
  }

  /** Set the channel purpose */
  async setPurpose(channelId: string, purpose: string): Promise<void> {
    await this.http.post('conversations.setPurpose', { channel: channelId, purpose });
  }

  /** Pin a message */
  async pinMessage(channelId: string, ts: string): Promise<void> {
    await this.http.post('pins.add', { channel: channelId, timestamp: ts });
  }

  /** Unpin a message */
  async unpinMessage(channelId: string, ts: string): Promise<void> {
    await this.http.post('pins.remove', { channel: channelId, timestamp: ts });
  }

  /** Star a message */
  async starMessage(channelId: string, ts: string): Promise<void> {
    await this.http.post('stars.add', { channel: channelId, timestamp: ts });
  }

  /** Mark a channel as read up to a given timestamp */
  async markRead(channelId: string, ts: string): Promise<void> {
    await this.http.post('conversations.mark', { channel: channelId, ts });
  }

  /** Set your status */
  async setStatus(text: string, emoji?: string, expiration?: number): Promise<void> {
    const profile: Record<string, any> = {
      status_text: text,
      status_emoji: emoji ?? '',
    };
    if (expiration) profile.status_expiration = expiration;
    await this.http.post('users.profile.set', { profile: JSON.stringify(profile) });
  }

  /** Set yourself as active or away */
  async setPresence(presence: 'auto' | 'away'): Promise<void> {
    await this.http.post('users.setPresence', { presence });
  }

  // ── Helpers ──────────────────────────────────────────────

  /** Resolve a channel name to its ID */
  async resolveChannel(channel: string): Promise<string> {
    if (channel.startsWith('C') || channel.startsWith('D') || channel.startsWith('G')) {
      return channel;
    }
    const channels = await this.listChannels();
    const found = channels.find((c) => c.name === channel.replace('#', ''));
    if (!found) throw new Error(`Channel "#${channel}" not found`);
    return found.id;
  }

  getWorkspace(): string {
    return this.http.getWorkspace();
  }
}
