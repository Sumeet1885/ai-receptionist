import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRecentMessageHistory } from '../src/services/conversationHistory';

test('fetches the newest 20 messages and returns them in chronological order', async () => {
  const calls: Record<string, unknown> = {};
  const newestFirst = [
    { sender: 'bot', content: 'newest', created_at: '2026-06-18T10:02:00Z' },
    { sender: 'user', content: 'middle', created_at: '2026-06-18T10:01:00Z' },
    { sender: 'bot', content: 'oldest', created_at: '2026-06-18T10:00:00Z' },
  ];

  const db = {
    from(table: string) {
      calls.table = table;
      return {
        select(columns: string) {
          calls.columns = columns;
          return {
            eq(column: string, value: string) {
              calls.filter = [column, value];
              return {
                order(column: string, options: { ascending: boolean }) {
                  calls.order = [column, options];
                  return {
                    async limit(value: number) {
                      calls.limit = value;
                      return { data: newestFirst, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const history = await fetchRecentMessageHistory(db, 'session-1');

  assert.deepEqual(calls.order, ['created_at', { ascending: false }]);
  assert.equal(calls.limit, 20);
  assert.deepEqual(history.map(message => message.text), ['oldest', 'middle', 'newest']);
});
