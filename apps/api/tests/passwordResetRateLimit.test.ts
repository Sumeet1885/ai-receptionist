import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

test('password reset enforces email, IP and flood limits before account lookup; activation has separate buckets', async () => {
  const { default: routes } = await import('../src/modules/accounts/public.routes');
  const { config } = await import('../src/config');
  const { supabase } = await import('../src/services/db');
  const oldRpc = supabase.rpc, oldFetch = globalThis.fetch;
  const oldSecret = config.turnstile.secretKey;
  let lookups = 0, captchaCalls = 0;
  supabase.rpc = (async (name: string) => {
    assert.equal(name, 'auth_email_exists'); lookups++;
    return { data: false, error: null };
  }) as any;
  config.turnstile.secretKey = 'rate-limit-test';
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).includes('challenges.cloudflare.com/turnstile/')) {
      captchaCalls++;
      return new Response(JSON.stringify({ success: true, hostname: new URL(config.clientUrl).hostname }), { status: 200 });
    }
    return oldFetch(url, init);
  }) as typeof fetch;
  const app = express();
  // Only this loopback test server trusts the test's simulated client IPs.
  app.set('trust proxy', 'loopback'); app.use(express.json()); app.use('/api/public', routes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/public`;
  async function post(email: string, ip: string, human = true) {
    const res = await fetch(`${base}/password-reset`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify({ email, formElapsedMs: human ? 8000 : 0, ref_code_x7: '', turnstileToken: 'test' }) });
    await res.text(); return res;
  }
  try {
    for (const email of ['Limit@yopmail.com', 'limit@YOPMAIL.com', 'limit@yopmail.com']) {
      assert.equal((await post(email, '203.0.113.11')).status, 202);
    }
    const emailDenied = await post('limit@yopmail.com', '203.0.113.12');
    assert.equal(emailDenied.status, 429); assert.ok(Number(emailDenied.headers.get('retry-after')) > 0);
    assert.equal(lookups, 3, 'blocked emails never reach account lookup');
    for (let n = 0; n < 10; n++) assert.equal((await post(`ip-${n}@yopmail.com`, '203.0.113.20')).status, 202);
    assert.equal((await post('ip-11@yopmail.com', '203.0.113.20')).status, 429);
    assert.equal(lookups, 13);
    const beforeCaptcha = captchaCalls;
    for (let n = 0; n < 20; n++) assert.equal((await post('flood@yopmail.com', '203.0.113.30', false)).status, 400);
    assert.equal((await post('flood@yopmail.com', '203.0.113.30', false)).status, 429);
    assert.equal(captchaCalls, beforeCaptcha, 'bots/floods are blocked before CAPTCHA calls');
    // Activation uses its own email bucket; invoke only its guards, without database/email work.
    const { publicFormGuards } = await import('../src/middleware/publicFormGuards');
    app.post('/activation-guard-test', ...publicFormGuards('activation-resend', { floodPer10Min: 20, perIpPerHour: 10, perEmailPerHour: 3 }), (_req, res) => res.sendStatus(202));
    const activation = await fetch(base.replace('/api/public', '/activation-guard-test'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'limit@yopmail.com', formElapsedMs: 8000, turnstileToken: 'test' }) });
    assert.equal(activation.status, 202); await activation.text();
  } finally {
    supabase.rpc = oldRpc; config.turnstile.secretKey = oldSecret; globalThis.fetch = oldFetch;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
