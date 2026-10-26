import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { consumeCalendarOAuthState, createCalendarOAuthState } from '../src/services/calendar/oauthState';

test('creates an opaque state token while storing only its hash', async () => {
  let inserted: any;
  const db = {
    from(table: string) {
      assert.equal(table, 'calendar_oauth_states');
      return {
        async insert(value: any) {
          inserted = value;
          return { error: null };
        },
      };
    },
  };
  const now = new Date('2026-06-18T10:00:00Z');

  const state = await createCalendarOAuthState({
    db,
    ownerId: 'owner-1',
    provider: 'google',
    now,
    randomBytes: () => Buffer.from('01234567890123456789012345678901'),
  });

  assert.notEqual(state, inserted.state_hash);
  assert.equal(inserted.state_hash, createHash('sha256').update(state).digest('hex'));
  assert.equal(inserted.owner_id, 'owner-1');
  assert.equal(inserted.provider, 'google');
  assert.equal(inserted.expires_at, '2026-06-18T10:10:00.000Z');
});

test('consumes state through the atomic database function and rejects replay', async () => {
  let calls = 0;
  const db = {
    async rpc(name: string, args: any) {
      assert.equal(name, 'consume_calendar_oauth_state');
      assert.equal(args.p_provider, 'google');
      assert.equal(args.p_state_hash, createHash('sha256').update('opaque-state').digest('hex'));
      calls += 1;
      return calls === 1
        ? { data: [{ owner_id: 'owner-1' }], error: null }
        : { data: [], error: null };
    },
  };

  assert.equal(await consumeCalendarOAuthState({ db, state: 'opaque-state', provider: 'google' }), 'owner-1');
  await assert.rejects(
    consumeCalendarOAuthState({ db, state: 'opaque-state', provider: 'google' }),
    /invalid, expired, or already used/i,
  );
});
