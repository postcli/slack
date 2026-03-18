import type { SlackChannel, SlackMessage, SlackUser } from '../types.js';

export class Channel {
  id: string;
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  isMember: boolean;
  topic: string;
  purpose: string;
  memberCount: number;
  created: Date;

  constructor(raw: SlackChannel) {
    this.id = raw.id;
    this.name = raw.name;
    this.isPrivate = raw.is_private;
    this.isArchived = raw.is_archived;
    this.isMember = raw.is_member;
    this.topic = raw.topic.value;
    this.purpose = raw.purpose.value;
    this.memberCount = raw.num_members;
    this.created = new Date(raw.created * 1000);
  }

  toData() {
    return {
      id: this.id,
      name: this.name,
      isPrivate: this.isPrivate,
      isArchived: this.isArchived,
      isMember: this.isMember,
      topic: this.topic,
      purpose: this.purpose,
      memberCount: this.memberCount,
      created: this.created.toISOString(),
    };
  }
}

export class Message {
  user: string;
  text: string;
  ts: string;
  threadTs?: string;
  replyCount: number;
  reactions: { name: string; count: number }[];
  hasThread: boolean;

  constructor(raw: SlackMessage) {
    this.user = raw.user ?? '';
    this.text = raw.text;
    this.ts = raw.ts;
    this.threadTs = raw.thread_ts;
    this.replyCount = raw.reply_count ?? 0;
    this.reactions = (raw.reactions ?? []).map((r) => ({ name: r.name, count: r.count }));
    this.hasThread = !!raw.thread_ts && (raw.reply_count ?? 0) > 0;
  }

  get date(): Date {
    return new Date(parseFloat(this.ts) * 1000);
  }

  toData() {
    return {
      user: this.user,
      text: this.text,
      ts: this.ts,
      date: this.date.toISOString(),
      threadTs: this.threadTs,
      replyCount: this.replyCount,
      reactions: this.reactions,
      hasThread: this.hasThread,
    };
  }
}

export class User {
  id: string;
  name: string;
  realName: string;
  displayName: string;
  isBot: boolean;
  isAdmin: boolean;
  deleted: boolean;
  email?: string;
  title?: string;
  avatar: string;
  statusText?: string;
  statusEmoji?: string;

  constructor(raw: SlackUser) {
    this.id = raw.id;
    this.name = raw.name;
    this.realName = raw.real_name;
    this.displayName = raw.profile.display_name || raw.real_name;
    this.isBot = raw.is_bot;
    this.isAdmin = raw.is_admin;
    this.deleted = raw.deleted;
    this.email = raw.profile.email;
    this.title = raw.profile.title;
    this.avatar = raw.profile.image_72;
    this.statusText = raw.profile.status_text;
    this.statusEmoji = raw.profile.status_emoji;
  }

  toData() {
    return {
      id: this.id,
      name: this.name,
      realName: this.realName,
      displayName: this.displayName,
      isBot: this.isBot,
      isAdmin: this.isAdmin,
      deleted: this.deleted,
      email: this.email,
      title: this.title,
      avatar: this.avatar,
      statusText: this.statusText,
      statusEmoji: this.statusEmoji,
    };
  }
}

export class Thread {
  parent: Message;
  replies: Message[];

  constructor(parent: Message, replies: Message[]) {
    this.parent = parent;
    this.replies = replies;
  }

  toData() {
    return {
      parent: this.parent.toData(),
      replies: this.replies.map((r) => r.toData()),
      replyCount: this.replies.length,
    };
  }
}
