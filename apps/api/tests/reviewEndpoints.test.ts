import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { validRecoveryProof } from '../src/modules/accounts/recoveryProof';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';
const close = (server: Server) => new Promise<void>(resolve => server.close(() => resolve()));

test('password recovery only issues a grant after a one-time server-verified OTP', async () => {
  const { default: routes } = await import('../src/modules/accounts/public.routes');
  const { config } = await import('../src/config');
  const originalFetch = globalThis.fetch;
  let consumed = false;
  globalThis.fetch = (async (url: any, options: any) => {
    if (String(url) === `${config.supabaseUrl}/auth/v1/verify`) {
      const body = JSON.parse(options.body);
      assert.equal(body.type, 'recovery');
      assert.equal(body.token_hash, 'a'.repeat(64));
      assert.equal(options.headers.apikey, config.supabaseServiceKey);
      if (consumed) return new Response(JSON.stringify({ code: 'otp_expired' }), { status: 403 });
      consumed = true;
      return new Response(JSON.stringify({ access_token: 'verified-token', refresh_token: 'verified-refresh', user: { id: 'owner', updated_at: 'version-1' } }), { status: 200 });
    }
    return originalFetch(url, options);
  }) as typeof fetch;
  const app = express(); app.use(express.json()); app.use(routes);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as any).port}/recovery-session`;
  try {
    const invalid = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenHash: 'fake' }) });
    assert.equal(invalid.status, 400); assert.equal(consumed, false);
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenHash: 'a'.repeat(64), type: 'magiclink' }) });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json() as any;
    assert.equal(result.accessToken, 'verified-token');
    assert.equal(validRecoveryProof(result.recoveryProof, result.accessToken, { id: 'owner', updatedAt: 'version-1' }, config.supabaseServiceKey), true);
    const replay = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenHash: 'a'.repeat(64) }) });
    assert.equal(replay.status, 400);
    assert.equal((await replay.text()).includes('verified-token'), false);
  } finally { globalThis.fetch = originalFetch; await close(server); }
});

test('concurrent support upload reservations are bounded and released when requests finish', async () => {
  const { supportUpload } = await import('../src/modules/support/uploads');
  const app = express(); app.use(express.json());
  const held: express.Response[] = [];
  let releaseAll: (() => void) | undefined;
  const ready = new Promise<void>(resolve => { releaseAll = resolve; });
  app.post('/upload', supportUpload(true), (_req, res) => { held.push(res); if (held.length === 10) releaseAll?.(); });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/upload`;
  const post = () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const requests = Array.from({ length: 10 }, post);
  try {
    await ready;
    const denied = await post();
    assert.equal(denied.status, 503); assert.equal(denied.headers.get('retry-after'), '5');
    held.forEach(res => res.json({ ok: true }));
    for (const response of await Promise.all(requests)) assert.equal(response.status, 200);
    const again = post();
    while (held.length < 11) await new Promise(resolve => setTimeout(resolve, 5));
    held.at(-1)!.json({ ok: true });
    assert.equal((await again).status, 200);
  } finally { held.forEach(res => { if (!res.writableEnded) res.end(); }); await close(server); }
});
