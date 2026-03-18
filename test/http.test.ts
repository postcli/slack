import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SlackApiError } from '../src/lib/http.js';

describe('SlackApiError', () => {
  it('includes method and code in message', () => {
    const err = new SlackApiError('auth.test', 'not_authed');
    assert.equal(err.message, 'Slack API auth.test: not_authed');
    assert.equal(err.method, 'auth.test');
    assert.equal(err.code, 'not_authed');
    assert.equal(err.name, 'SlackApiError');
  });
});
