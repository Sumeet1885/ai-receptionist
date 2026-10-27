import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

function fakeResponse() {
  const res: any = { headersSent: false, statusCode: 0, body: undefined };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; res.headersSent = true; return res; };
  return res;
}

async function run(error: unknown) {
  const { asyncRoute } = await import('../src/utils/asyncRoute');
  const res = fakeResponse();
  asyncRoute('Test', async () => { throw error; })({ originalUrl: '/x' } as any, res, () => undefined);
  await new Promise((resolve) => setImmediate(resolve));
  return res;
}

test('a missing table or column is reported as an update in progress, never as raw SQL', async () => {
  for (const error of [
    Object.assign(new Error('list orders: column billing_orders.reminder_sent_at does not exist'), { code: '42703' }),
    Object.assign(new Error('x'), { code: '42P01' }),
    Object.assign(new Error("Could not find the table 'public.x' in the schema cache"), { code: 'PGRST205' }),
  ]) {
    const res = await run(error);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'schema_out_of_date');
    assert.match(res.body.reference, /^[0-9a-f]{8}$/);
    assert.doesNotMatch(JSON.stringify(res.body), /billing_orders|column|schema cache/);
  }
});

test('other failures return a reference and no internal details', async () => {
  const res = await run(new Error('connect ECONNREFUSED 10.0.0.1:5432'));
  assert.equal(res.statusCode, 500);
  assert.match(res.body.reference, /^[0-9a-f]{8}$/);
  assert.doesNotMatch(JSON.stringify(res.body), /ECONNREFUSED|10\.0\.0\.1/);
});

test('customers: anyone signed in can view; resend needs support; suspend needs super_admin', async () => {
  const routes = await readFile(fileURLToPath(new URL('../src/modules/customers/admin.routes.ts', import.meta.url)), 'utf8');
  assert.match(routes, /router\.get\('\/', requireAdminRole\('read_only'\)/);
  assert.match(routes, /router\.post\('\/:id\/resend', requireAdminRole\('support'\)/);
  assert.match(routes, /router\.post\('\/:id\/status', requireAdminRole\('super_admin'\)/);
  assert.match(routes, /customer\.suspend/);
  assert.match(await readFile(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8'), /app\.use\('\/api\/admin\/customers', customerAdminRoutes\)/);

  // Suspension also blocks the Supabase login, not just the app's own stage.
  const repo = await readFile(fileURLToPath(new URL('../src/modules/customers/repository.ts', import.meta.url)), 'utf8');
  assert.match(repo, /ban_duration: status === 'suspended' \? '876000h' : 'none'/);
});
