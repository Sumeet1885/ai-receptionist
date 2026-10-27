import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

const adminRoutesUrl = new URL('../src/modules/access-requests/admin.routes.ts', import.meta.url);
const accountsMigrationUrl = new URL('../../../supabase/migrations/20261027140000_customer_accounts.sql', import.meta.url);
const indexUrl = new URL('../src/index.ts', import.meta.url);

function fakeSocket() {
  const socket = { written: '', destroyed: false, write(chunk: string) { socket.written += chunk; return true; }, destroy() { socket.destroyed = true; } };
  return socket;
}

test('upgrade router dispatches by exact path and refuses unknown paths', async () => {
  const { routeUpgrades } = await import('../src/utils/upgradeRouter');
  const server = new EventEmitter() as any;
  const calls: string[] = [];
  routeUpgrades(server, {
    '/api/chat/live': () => calls.push('live'),
    '/api/admin/events': () => calls.push('admin'),
  });

  server.emit('upgrade', { url: '/api/chat/live?botId=1&sessionId=2' }, fakeSocket(), Buffer.alloc(0));
  server.emit('upgrade', { url: '/api/admin/events' }, fakeSocket(), Buffer.alloc(0));
  const unknown = fakeSocket();
  server.emit('upgrade', { url: '/api/chat/live/extra' }, unknown, Buffer.alloc(0));

  assert.deepEqual(calls, ['live', 'admin']);
  assert.match(unknown.written, /^HTTP\/1\.1 400 /);
  assert.equal(unknown.destroyed, true);
});

test('both WebSocket servers are registered through the router, not attached to the HTTP server', async () => {
  const source = await readFile(fileURLToPath(indexUrl), 'utf8');
  assert.match(source, /routeUpgrades\(server, \{\s*'\/api\/chat\/live': setupWebSocketServer\(\),\s*'\/api\/admin\/events': createAdminEventsServer\(\),/);
  const live = await readFile(fileURLToPath(new URL('../src/controllers/liveChatController.ts', import.meta.url)), 'utf8');
  assert.match(live, /new WebSocketServer\(\{ noServer: true \}\)/);
});

test('admin events socket refuses other origins before looking at the session', async () => {
  const { createAdminEventsServer } = await import('../src/modules/admin-auth/events.socket');
  const handler = createAdminEventsServer();
  const socket = fakeSocket();
  handler({ headers: { origin: 'https://evil.example', cookie: 'admin_session=x' } } as any, socket as any, Buffer.alloc(0));
  assert.match(socket.written, /^HTTP\/1\.1 403 /);
  assert.equal(socket.destroyed, true);
});

test('review routes require a session and the right role for each action', async () => {
  const source = await readFile(fileURLToPath(adminRoutesUrl), 'utf8');
  assert.match(source, /router\.use\(adminOriginGuard\(config\.admin\.origin\)\);\s*router\.use\(requireAdminSession\);/);
  assert.match(source, /router\.get\('\/', requireAdminRole\('read_only'\)/);
  assert.match(source, /router\.get\('\/:id', requireAdminRole\('read_only'\)/);
  assert.match(source, /router\.patch\('\/:id', requireAdminRole\('support'\)/);
  assert.match(source, /router\.post\('\/:id\/reject', requireAdminRole\('support'\)/);
  assert.match(source, /router\.post\('\/:id\/approve', requireAdminRole\('super_admin'\)/);
  assert.match(source, /router\.post\('\/:id\/resend-activation', requireAdminRole\('support'\)/);
  // Decisions are compare-and-set on the current status, so two admins cannot both act.
  assert.match(source, /transitionAccessRequest\(request\.id, \[request\.status\], \{\s*status: 'approved'/);
  assert.match(source, /transitionAccessRequest\(request\.id, OPEN_STATUSES, \{\s*status: 'rejected'/);
});

test('customer accounts are API-only and every existing login is backfilled as fully set up', async () => {
  const sql = await readFile(fileURLToPath(accountsMigrationUrl), 'utf8');
  assert.match(sql, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /ALTER TABLE public\.customer_accounts ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.customer_accounts FROM anon, authenticated/i);
  assert.doesNotMatch(sql, /CREATE POLICY/i);
  assert.match(sql, /INSERT INTO public\.customer_accounts \(user_id, password_set_at, onboarding_completed_at\)\s*SELECT id, created_at, NOW\(\)\s*FROM auth\.users\s*ON CONFLICT \(user_id\) DO NOTHING/i);
});

test('emailed links point at the web app and carry only the hashed token', async () => {
  const { customerLinkUrl } = await import('../src/modules/accounts/links');
  const { config } = await import('../src/config');
  const url = new URL(customerLinkUrl('abc+/=', 'invite'));
  assert.equal(url.origin, new URL(config.clientUrl).origin);
  assert.equal(url.pathname, '/auth/confirm');
  assert.equal(url.searchParams.get('token_hash'), 'abc+/=');
  assert.equal(url.searchParams.get('type'), 'invite');
});
