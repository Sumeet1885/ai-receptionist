import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

// Loaded after the env defaults above, because config.ts requires them at import time.
const load = async () => ({
  ...(await import('../src/middleware/botGuard')),
  ...(await import('../src/middleware/turnstile')),
  ...(await import('../src/middleware/publicFormGuards')),
  ...(await import('../src/middleware/rateLimit')),
  ...(await import('../src/config')),
});

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as any,
    headers: {} as Record<string, string>,
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; return res; },
    setHeader(name: string, value: string) { res.headers[name] = value; },
  };
  return res;
}

async function run(middleware: any, req: any) {
  const res = fakeRes();
  let passed = false;
  await middleware({ headers: {}, ip: '203.0.113.9', originalUrl: '/test', ...req }, res, () => { passed = true; });
  return { res, passed };
}

test('bot guard rejects a filled honeypot or a too-fast submit and strips its fields', async () => {
  const { botGuard, verifyTurnstile, publicFormGuards, publicOriginGuard, createRateLimit, config } = await load();
  const human = { ref_code_x7: '', formElapsedMs: 8000, email: 'a@b.co' };
  const ok = await run(botGuard, { body: human });
  assert.equal(ok.passed, true);
  assert.deepEqual(human, { email: 'a@b.co' });

  assert.equal((await run(botGuard, { body: { ref_code_x7: 'spam', formElapsedMs: 8000 } })).res.statusCode, 400);
  assert.equal((await run(botGuard, { body: { ref_code_x7: '', formElapsedMs: 900 } })).res.statusCode, 400);
  assert.equal((await run(botGuard, { body: { ref_code_x7: '' } })).res.statusCode, 400);
});

test('Turnstile is skipped only in development and fails closed elsewhere without a secret', async () => {
  const { botGuard, verifyTurnstile, publicFormGuards, publicOriginGuard, createRateLimit, config } = await load();
  const original = { env: config.environment, secret: config.turnstile.secretKey };
  try {
    config.turnstile.secretKey = '';
    config.environment = 'development';
    const body = { turnstileToken: 'x' };
    const dev = await run(verifyTurnstile, { body });
    assert.equal(dev.passed, true);
    assert.equal('turnstileToken' in body, false);

    config.environment = 'production';
    const prod = await run(verifyTurnstile, { body: { turnstileToken: 'x' } });
    assert.equal(prod.passed, false);
    assert.equal(prod.res.statusCode, 503);
  } finally {
    config.environment = original.env;
    config.turnstile.secretKey = original.secret;
  }
});

test('Turnstile verifies the token and binds it to our app hostname', async () => {
  const { botGuard, verifyTurnstile, publicFormGuards, publicOriginGuard, createRateLimit, config } = await load();
  const original = { env: config.environment, secret: config.turnstile.secretKey, url: config.clientUrl, fetch: globalThis.fetch };
  let reply: Record<string, unknown> = {};
  let sentBody: any;
  globalThis.fetch = (async (_url: string, init: any) => {
    sentBody = JSON.parse(init.body);
    return { ok: true, json: async () => reply };
  }) as any;
  try {
    config.environment = 'production';
    config.turnstile.secretKey = 'secret';
    config.clientUrl = 'https://bolegaindia.ai';

    assert.equal((await run(verifyTurnstile, { body: {} })).res.statusCode, 400, 'missing token');

    reply = { success: true, hostname: 'bolegaindia.ai' };
    const body = { turnstileToken: 'tok', email: 'a@b.co' };
    const ok = await run(verifyTurnstile, { body });
    assert.equal(ok.passed, true);
    assert.equal(sentBody.secret, 'secret');
    assert.equal(sentBody.response, 'tok');
    assert.deepEqual(body, { email: 'a@b.co' });

    reply = { success: true, hostname: 'staging.example.com' };
    assert.equal((await run(verifyTurnstile, { body: { turnstileToken: 'tok' } })).res.statusCode, 403, 'foreign host');

    reply = { success: false, 'error-codes': ['invalid-input-response'] };
    assert.equal((await run(verifyTurnstile, { body: { turnstileToken: 'tok' } })).res.statusCode, 403);

    globalThis.fetch = (async () => { throw new Error('network'); }) as any;
    assert.equal((await run(verifyTurnstile, { body: { turnstileToken: 'tok' } })).res.statusCode, 503);
  } finally {
    config.environment = original.env;
    config.turnstile.secretKey = original.secret;
    config.clientUrl = original.url;
    globalThis.fetch = original.fetch;
  }
});

test('public origin guard refuses other sites but allows our app and non-browser callers', async () => {
  const { botGuard, verifyTurnstile, publicFormGuards, publicOriginGuard, createRateLimit, config } = await load();
  const original = config.clientUrl;
  try {
    config.clientUrl = 'https://bolegaindia.ai';
    assert.equal((await run(publicOriginGuard, { headers: { origin: 'https://bolegaindia.ai' } })).passed, true);
    assert.equal((await run(publicOriginGuard, { headers: {} })).passed, true);
    assert.equal((await run(publicOriginGuard, { headers: { origin: 'https://evil.example' } })).res.statusCode, 403);
  } finally {
    config.clientUrl = original;
  }
});

test('guards run cheap checks before Turnstile and count verified submissions per email', async () => {
  const { botGuard, verifyTurnstile, publicFormGuards } = await load();
  const chain = publicFormGuards('test-form', { floodPer10Min: 30, perIpPerHour: 10, perEmailPerHour: 3 });
  const botIndex = chain.indexOf(botGuard);
  const captchaIndex = chain.indexOf(verifyTurnstile);
  assert.ok(botIndex > 1 && captchaIndex === botIndex + 1, 'flood limit, then bot guard, then Turnstile');
  assert.equal(chain.length, 7);
});

test('keyed rate limits use the email, case-insensitively, and skip requests without one', async () => {
  const { botGuard, verifyTurnstile, publicFormGuards, publicOriginGuard, createRateLimit, config } = await load();
  const limit = createRateLimit(
    { keyPrefix: `email-test-${Date.now()}`, limit: 2, windowMs: 60_000 },
    (req) => (typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : null),
  );
  assert.equal((await run(limit, { body: { email: 'A@b.co' } })).passed, true);
  assert.equal((await run(limit, { body: { email: 'a@B.co' } })).passed, true);
  assert.equal((await run(limit, { body: { email: 'a@b.co' } })).res.statusCode, 429);
  assert.equal((await run(limit, { body: {} })).passed, true);
});
