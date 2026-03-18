import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Channel, Message, User, Thread } from '../src/lib/models.js';

describe('Channel', () => {
  const raw = {
    id: 'C01234',
    name: 'general',
    is_channel: true,
    is_group: false,
    is_im: false,
    is_mpim: false,
    is_private: false,
    is_archived: false,
    is_member: true,
    topic: { value: 'General discussion' },
    purpose: { value: 'Company-wide announcements' },
    num_members: 42,
    created: 1609459200,
    updated: 1609459200,
  };

  it('parses raw channel data', () => {
    const ch = new Channel(raw);
    assert.equal(ch.id, 'C01234');
    assert.equal(ch.name, 'general');
    assert.equal(ch.isPrivate, false);
    assert.equal(ch.isMember, true);
    assert.equal(ch.memberCount, 42);
    assert.equal(ch.topic, 'General discussion');
  });

  it('serializes with toData()', () => {
    const ch = new Channel(raw);
    const data = ch.toData();
    assert.equal(data.id, 'C01234');
    assert.equal(data.name, 'general');
    assert.equal(typeof data.created, 'string');
  });
});

describe('Message', () => {
  const raw = {
    type: 'message',
    user: 'U01234',
    text: 'Hello world',
    ts: '1609459200.000001',
    thread_ts: '1609459200.000001',
    reply_count: 3,
  };

  it('parses raw message data', () => {
    const msg = new Message(raw);
    assert.equal(msg.user, 'U01234');
    assert.equal(msg.text, 'Hello world');
    assert.equal(msg.replyCount, 3);
    assert.equal(msg.hasThread, true);
  });

  it('computes date from ts', () => {
    const msg = new Message(raw);
    assert.ok(msg.date instanceof Date);
    assert.equal(msg.date.getFullYear(), 2020);
  });

  it('handles message without thread', () => {
    const msg = new Message({ type: 'message', text: 'solo', ts: '1609459200.000001' });
    assert.equal(msg.hasThread, false);
    assert.equal(msg.replyCount, 0);
  });
});

describe('User', () => {
  const raw = {
    id: 'U01234',
    name: 'johndoe',
    real_name: 'John Doe',
    is_bot: false,
    is_admin: true,
    deleted: false,
    tz: 'America/New_York',
    profile: {
      real_name: 'John Doe',
      display_name: 'JD',
      email: 'john@example.com',
      image_72: 'https://example.com/avatar.png',
      title: 'Engineer',
      status_text: 'Working',
      status_emoji: ':computer:',
    },
    updated: 1609459200,
  };

  it('parses raw user data', () => {
    const user = new User(raw);
    assert.equal(user.id, 'U01234');
    assert.equal(user.displayName, 'JD');
    assert.equal(user.email, 'john@example.com');
    assert.equal(user.isAdmin, true);
  });

  it('falls back to real_name when display_name is empty', () => {
    const noDisplay = { ...raw, profile: { ...raw.profile, display_name: '' } };
    const user = new User(noDisplay);
    assert.equal(user.displayName, 'John Doe');
  });
});

describe('Thread', () => {
  it('separates parent from replies', () => {
    const parent = new Message({ type: 'message', user: 'U1', text: 'parent', ts: '1.0' });
    const r1 = new Message({ type: 'message', user: 'U2', text: 'reply1', ts: '1.1' });
    const r2 = new Message({ type: 'message', user: 'U3', text: 'reply2', ts: '1.2' });
    const thread = new Thread(parent, [r1, r2]);

    assert.equal(thread.parent.text, 'parent');
    assert.equal(thread.replies.length, 2);
    const data = thread.toData();
    assert.equal(data.replyCount, 2);
  });
});
