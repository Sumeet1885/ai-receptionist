import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatReplyBody, resolveVisitorTimezone } from '../client/src/lib/chatRequest';

test('createChatReplyBody includes the visitor IANA timezone', () => {
  assert.deepEqual(
    createChatReplyBody('session-1', 'Hello', () => 'Europe/London'),
    {
      sessionId: 'session-1',
      userMessage: 'Hello',
      timezone: 'Europe/London',
    },
  );
});

test('resolveVisitorTimezone falls back when browser resolution is empty', () => {
  assert.equal(resolveVisitorTimezone(() => '  '), 'Asia/Kolkata');
});

test('resolveVisitorTimezone falls back when browser resolution throws', () => {
  assert.equal(
    resolveVisitorTimezone(() => {
      throw new Error('Intl unavailable');
    }),
    'Asia/Kolkata',
  );
});

