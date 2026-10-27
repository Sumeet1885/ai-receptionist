import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  checkPasswordPolicy,
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from '../src/modules/staff-auth/password';
import {
  hasRole,
  hashSessionToken,
  isSessionUsable,
  newSessionToken,
  readCookie,
  sessionCookieName,
  sessionCookieOptions,
  SESSION_IDLE_MS,
} from '../src/modules/staff-auth/session';

const migrationUrl = new URL('../../../supabase/migrations/20261027120000_staff_auth.sql', import.meta.url);
const routesUrl = new URL('../src/modules/staff-auth/staff-auth.routes.ts', import.meta.url);

test('scrypt hashes verify only the original password and carry their parameters', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.match(hash, /^scrypt\$131072\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('correct horse battery stapl', hash), false);
  assert.notEqual(await hashPassword('correct horse battery staple'), hash, 'salt must differ per hash');
});

test('malformed stored hashes are rejected without throwing', async () => {
  for (const stored of ['', 'bcrypt$x', 'scrypt$abc$8$1$c2FsdA==$a2V5', 'scrypt$1024$8$1$$']) {
    assert.equal(await verifyPassword('anything', stored), false, stored);
  }
});

test('password policy enforces length, email name and common passwords', () => {
  assert.match(checkPasswordPolicy('short', 'ops@example.com')!, /at least 12/);
  assert.match(checkPasswordPolicy('x'.repeat(129), 'ops@example.com')!, /at most 128/);
  assert.match(checkPasswordPolicy('paras-is-admin-2026', 'paras@example.com')!, /email name/);
  assert.match(checkPasswordPolicy('Password1234', 'ops@example.com')!, /too common/);
  assert.equal(checkPasswordPolicy('violet-orbit-tunnel-42', 'ops@example.com'), null);
  assert.equal(checkPasswordPolicy(generateTemporaryPassword(), 'ops@example.com'), null);
});

test('session tokens are random and only their hash is stored', () => {
  const token = newSessionToken();
  assert.ok(token.length >= 43);
  assert.notEqual(newSessionToken(), token);
  assert.match(hashSessionToken(token), /^[a-f0-9]{64}$/);
  assert.equal(hashSessionToken(token), hashSessionToken(token));
});

test('session cookie is httpOnly, strict and secure outside development', () => {
  assert.equal(sessionCookieName('production'), '__Host-admin_session');
  assert.deepEqual(sessionCookieOptions('production'), { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
  assert.equal(sessionCookieName('development'), 'admin_session');
  assert.equal(sessionCookieOptions('development').secure, false);
  assert.equal(readCookie('a=1; admin_session=tok%2Fen; b=2', 'admin_session'), 'tok/en');
  assert.equal(readCookie('x_admin_session=nope', 'admin_session'), undefined);
  assert.equal(readCookie(undefined, 'admin_session'), undefined);
});

test('sessions expire on revocation, absolute expiry and idle timeout', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  const live = { expires_at: '2026-10-27T18:00:00Z', last_seen_at: '2026-10-27T11:55:00Z', revoked_at: null };
  assert.equal(isSessionUsable(live, now), true);
  assert.equal(isSessionUsable({ ...live, revoked_at: '2026-10-27T11:59:00Z' }, now), false);
  assert.equal(isSessionUsable({ ...live, expires_at: '2026-10-27T11:59:59Z' }, now), false);
  assert.equal(isSessionUsable({ ...live, last_seen_at: new Date(now - SESSION_IDLE_MS - 1).toISOString() }, now), false);
});

test('roles are hierarchical and an empty role set grants nothing', () => {
  assert.equal(hasRole(['super_admin'], 'support'), true);
  assert.equal(hasRole(['support'], 'read_only'), true);
  assert.equal(hasRole(['read_only'], 'support'), false);
  assert.equal(hasRole([], 'read_only'), false);
});

test('admin origin guard blocks cross-origin state changes but allows reads', async () => {
  process.env.SUPABASE_URL ||= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
  process.env.GEMINI_API_KEY ||= 'test';
  const { adminOriginGuard } = await import('../src/modules/staff-auth/middleware');
  const guard = adminOriginGuard('https://admin.example.com');

  const run = (method: string, origin?: string) => {
    let status = 0;
    let passed = false;
    const res = { status(code: number) { status = code; return this; }, json() { return this; } };
    guard({ method, headers: origin ? { origin } : {} } as any, res as any, () => { passed = true; });
    return { status, passed };
  };

  assert.deepEqual(run('POST', 'https://admin.example.com'), { status: 0, passed: true });
  assert.deepEqual(run('POST', 'https://app.example.com'), { status: 403, passed: false });
  assert.deepEqual(run('POST'), { status: 403, passed: false });
  assert.deepEqual(run('GET', 'https://evil.example.com'), { status: 0, passed: true });
});

test('staff tables are private to the service role and audit is append-only', async () => {
  const sql = await readFile(fileURLToPath(migrationUrl), 'utf8');

  for (const table of ['staff_principals', 'staff_role_assignments', 'staff_sessions', 'staff_audit_events']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`, 'i'));
  }
  assert.doesNotMatch(sql, /CREATE POLICY/i, 'no policy may expose staff tables to customer roles');
  assert.doesNotMatch(sql, /REFERENCES auth\.users/i, 'staff identity must not link to customer auth');
  assert.match(sql, /REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public\.staff_audit_events FROM service_role/i);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.staff_audit_events/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.staff_record_login_failure\(UUID\) TO service_role/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.staff_record_login_failure\(UUID\) FROM authenticated/i);
});

test('admin routes check origin first, rate-limit login and never echo internal errors', async () => {
  const source = await readFile(fileURLToPath(routesUrl), 'utf8');

  const guardPosition = source.indexOf('router.use(adminOriginGuard(config.admin.origin))');
  const loginPosition = source.indexOf("router.post('/auth/login'");
  assert.ok(guardPosition >= 0 && guardPosition < loginPosition, 'origin guard must run before every route');
  assert.match(source, /router\.post\('\/auth\/login', loginRateLimit,/);
  assert.match(source, /router\.post\('\/auth\/password', passwordRateLimit, requireStaffSession,/);
  assert.match(source, /verifyPassword\(password, principal\?\.password_hash \?\? await getDummyHash\(\)\)/);
  assert.match(source, /res\.status\(500\)\.json\(\{ error: 'Something went wrong' \}\)/);
});
