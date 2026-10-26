import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('typed chat refuses replies for a deactivated bot', async () => {
  const source = await readFile(
    fileURLToPath(new URL('../src/routes/chat.routes.ts', import.meta.url)),
    'utf8',
  );

  assert.match(
    source,
    /\.eq\('id', session\.bot_id\)\s*\.eq\('is_active', true\)\s*\.single\(\)/,
  );
});

test('public JSON chat routes answer preflight before rate limiting while keeping origin checks on real requests', async () => {
  const source = await readFile(
    fileURLToPath(new URL('../src/routes/chat.routes.ts', import.meta.url)),
    'utf8',
  );

  const preflightPosition = source.indexOf("router.options(['/reply', '/session']");
  const rateLimitPosition = source.indexOf('router.use(chatRateLimit)');

  assert.ok(preflightPosition >= 0, 'expected an OPTIONS handler for public JSON chat routes');
  assert.ok(preflightPosition < rateLimitPosition, 'preflight must not consume the chat rate limit');
  assert.match(source, /applyCorsOrigin\(res, req\.headers\.origin\)/);
  assert.match(source, /if \(!checkCors\(req, res, bot\.allowed_domains\)\) return/g);
});
