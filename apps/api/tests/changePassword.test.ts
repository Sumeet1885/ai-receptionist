import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

test('password changes verify current credentials for the signed-in owner before updating', async () => {
  const { supabase } = await import('../src/services/db');
  const { default: routes } = await import('../src/modules/accounts/account.routes');
  const { config } = await import('../src/config');
  const { issueRecoveryProof } = await import('../src/modules/accounts/recoveryProof');
  const { getSesClient } = await import('../src/aws');
  const ses = getSesClient();
  const originals = { from: supabase.from, getUser: supabase.auth.getUser, update: supabase.auth.admin.updateUserById, fetch: globalThis.fetch, send: ses.send };
  let confirmed = true; let updates = 0; let checks = 0;
  let authVersion = 'version-0';
  const account = { user_id: 'owner', status: 'active', password_set_at: 'set', onboarding_completed_at: 'done' };
  (supabase as any).from = () => { const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: account, error: null }) }; return q; };
  (supabase.auth as any).getUser = async () => ({ data: { user: { id: 'owner', email: 'owner@yopmail.com', email_confirmed_at: confirmed ? 'verified' : null, updated_at: authVersion } }, error: null });
  (supabase.auth.admin as any).updateUserById = async (id: string, value: any) => { assert.equal(id, 'owner'); assert.equal(value.password, 'New-secret-42'); updates++; authVersion = `version-${updates}`; return { error: null }; };
  (ses as any).send = async () => ({ MessageId: 'mock' });
  globalThis.fetch = (async (url: any, options: any) => {
    if (String(url).startsWith(`${config.supabaseUrl}/auth/v1/token`)) {
      checks++; const body = JSON.parse(options.body); assert.equal(body.email, 'owner@yopmail.com');
      return new Response(JSON.stringify(body.password === 'Current-secret-42' ? { user: { id: 'owner' } } : { error: 'invalid_credentials' }), { status: body.password === 'Current-secret-42' ? 200 : 400 });
    }
    return originals.fetch(url, options);
  }) as typeof fetch;
  const app = express(); app.use(express.json()); app.use('/account', routes);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/account/change-password`;
  const post = (body: any, signedIn = true) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(signedIn ? { Authorization: 'Bearer test' } : {}) }, body: JSON.stringify(body) });
  try {
    const legacy = (body: any) => fetch(url.replace('/change-password', '/password'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' }, body: JSON.stringify(body) });
    assert.equal((await legacy({ password: 'New-secret-42' })).status, 403);
    assert.equal(updates, 0);
    assert.equal((await post({}, false)).status, 401);
    confirmed = false; assert.equal((await post({ currentPassword: 'Current-secret-42', password: 'New-secret-42' })).status, 403); confirmed = true;
    assert.equal((await post({ currentPassword: 'wrong', password: 'New-secret-42' })).status, 400);
    assert.equal(updates, 0);
    assert.equal((await post({ currentPassword: 'Current-secret-42', password: 'short' })).status, 400);
    assert.equal((await post({ currentPassword: 'Current-secret-42', password: 'New-secret-42', email: 'attacker@yopmail.com', userId: 'attacker' })).status, 200);
    assert.equal(updates, 1); assert.equal(checks, 2);
    const recoveryProof = issueRecoveryProof('test', { id: 'owner', updatedAt: authVersion }, config.supabaseServiceKey);
    assert.equal((await legacy({ password: 'New-secret-42', recoveryProof })).status, 200);
    assert.equal(updates, 2);
    assert.equal((await legacy({ password: 'New-secret-42', recoveryProof })).status, 403);
  } finally {
    supabase.from = originals.from; supabase.auth.getUser = originals.getUser; supabase.auth.admin.updateUserById = originals.update; globalThis.fetch = originals.fetch; ses.send = originals.send;
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
