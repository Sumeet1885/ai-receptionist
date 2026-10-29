import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRequest } from '../src/lib/sessionRecovery';

function fixture() {
  let token = 'old'; let refreshes = 0; let signouts = 0;
  let error: { status: number } | null = null;
  const auth = {
    getSession: async () => ({ data: { session: token ? { access_token: token } : null } }),
    refreshSession: async () => {
      refreshes++;
      await new Promise(resolve => setTimeout(resolve, 5));
      if (!error) token = 'new';
      return { data: { session: error ? null : { access_token: token } }, error };
    },
    signOut: async (options: { scope: 'local' }) => { assert.equal(options.scope, 'local'); signouts++; token = ''; },
  };
  return { auth, run: createSessionRequest(auth), counts: () => ({ refreshes, signouts }), rejectRefresh: (status: number) => { error = { status }; }, setToken: (value: string) => { token = value; } };
}

test('concurrent rejected tokens share one refresh and retry with the new token', async () => {
  const f = fixture();
  const calls: string[] = [];
  const request = async (token: string) => { calls.push(token); return new Response('{}', { status: token === 'old' ? 401 : 200 }); };
  const results = await Promise.all([f.run(request), f.run(request), f.run(request)]);
  assert.deepEqual(results.map(r => r.status), [200, 200, 200]);
  assert.deepEqual(f.counts(), { refreshes: 1, signouts: 0 });
  assert.deepEqual(calls, ['old', 'old', 'old', 'new', 'new', 'new']);
});

test('invalid refresh tokens end only the local session; transient failures preserve it', async () => {
  for (const status of [400, 401, 403, 503]) {
    const f = fixture(); f.rejectRefresh(status);
    await assert.rejects(f.run(async () => new Response('{}', { status: 401 })), status === 503 ? /Could not refresh/ : /session has ended/);
    assert.deepEqual(f.counts(), { refreshes: 1, signouts: status === 503 ? 0 : 1 });
  }
});

test('retry is bounded and ordinary permission/server failures do not refresh or sign out', async () => {
  for (const status of [200, 403, 503]) {
    const f = fixture(); assert.equal((await f.run(async () => new Response('{}', { status }))).status, status);
    assert.deepEqual(f.counts(), { refreshes: 0, signouts: 0 });
  }
  const f = fixture(); let attempts = 0;
  assert.equal((await f.run(async () => { attempts++; return new Response('{}', { status: 401 }); })).status, 401);
  assert.equal(attempts, 2); assert.deepEqual(f.counts(), { refreshes: 1, signouts: 1 });
});

test('a token refreshed elsewhere is reused, and a newer login is never signed out', async () => {
  const f = fixture();
  assert.equal((await f.run(async token => { if (token === 'old') { f.setToken('elsewhere'); return new Response('{}', { status: 401 }); } return new Response('{}'); })).status, 200);
  assert.deepEqual(f.counts(), { refreshes: 0, signouts: 0 });
  const g = fixture(); let calls = 0;
  await g.run(async () => { calls++; if (calls === 2) g.setToken('new-login'); return new Response('{}', { status: 401 }); });
  assert.deepEqual(g.counts(), { refreshes: 1, signouts: 0 });
});
