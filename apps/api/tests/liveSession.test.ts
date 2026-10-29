import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLiveSessionContext } from '../src/services/liveSession';

function singleResult(data: any, error: any = null) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    single: async () => ({ data, error }),
  };
  return builder;
}

test('loads an active bot only when the live session belongs to it', async () => {
  const bot = { id: 'bot-1', is_active: true };
  const db = {
    from(table: string) {
      if (table === 'chat_sessions') return singleResult({ bot_id: 'bot-1' });
      if (table === 'bots') return singleResult(bot);
      throw new Error(`Unexpected table ${table}`);
    },
  };

  assert.deepEqual(await loadLiveSessionContext(db, 'bot-1', 'session-1'), { bot });
});

test('rejects a live connection when the session belongs to another bot', async () => {
  const db = {
    from(table: string) {
      assert.equal(table, 'chat_sessions');
      return singleResult({ bot_id: 'bot-2' });
    },
  };

  await assert.rejects(loadLiveSessionContext(db, 'bot-1', 'session-1'), /does not belong/i);
});

test('rejects missing sessions and inactive bots', async () => {
  const missingSessionDb = {
    from: () => singleResult(null, new Error('not found')),
  };
  await assert.rejects(loadLiveSessionContext(missingSessionDb, 'bot-1', 'missing'), /session not found/i);

  const inactiveBotDb = {
    from(table: string) {
      if (table === 'chat_sessions') return singleResult({ bot_id: 'bot-1' });
      return singleResult(null, new Error('inactive'));
    },
  };
  await assert.rejects(loadLiveSessionContext(inactiveBotDb, 'bot-1', 'session-1'), /bot not found or inactive/i);
});
