import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateTimeIST, formatExpiryIST, validISODate, workspacePeriodEnd } from '@ai-receptionist/contracts';
import { computeAccountStage } from '../src/modules/accounts/stage';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

test('monthly deadlines clamp month ends and remain accessible through 23:59 IST', () => {
  assert.equal(workspacePeriodEnd('2027-01-31T00:01:00+05:30', { months: 1 }), '2027-02-28T18:30:00.000Z');
  assert.equal(workspacePeriodEnd('2028-01-31T00:01:00+05:30', { months: 1 }), '2028-02-29T18:30:00.000Z');
  assert.equal(workspacePeriodEnd('2026-12-31T23:59:00+05:30', { months: 1 }), '2027-01-31T18:30:00.000Z');
  assert.equal(workspacePeriodEnd('2026-10-28T11:00:00+05:30', { days: 14 }), '2026-11-11T18:30:00.000Z');
  const expiry = workspacePeriodEnd('2026-10-28', { endDate: '2026-11-01' });
  assert.match(formatExpiryIST(expiry), /1 Nov 2026, 11:59 pm IST/);
  assert.match(formatDateTimeIST('2026-10-29T18:31:00Z'), /30 Oct 2026, 12:01 am IST/);
  assert.equal(validISODate('2027-02-29'), false);
  assert.equal(validISODate('2028-02-29'), true);
  assert.equal(validISODate('2026-13-01'), false);
});

test('scheduled access locks before 00:01 IST, opens at the instant, and locks at expiry', async () => {
  const { workspaceIsBlocked } = await import('../src/middleware/workspaceAccess');
  const start = Date.parse('2026-10-30T00:01:00+05:30');
  const end = Date.parse('2026-11-30T00:00:00+05:30');
  const account = { status: 'active', access_months: 1, plan_started_at: new Date(start).toISOString(), access_starts_at: new Date(start).toISOString(), access_expires_at: new Date(end).toISOString() };
  assert.equal(workspaceIsBlocked(account, start - 1), true);
  assert.equal(workspaceIsBlocked(account, start), false);
  assert.equal(workspaceIsBlocked(account, end - 1), false);
  assert.equal(workspaceIsBlocked(account, end), true);
  assert.equal(workspaceIsBlocked({ ...account, plan_started_at: null }, start), true, 'unverified grant stays locked');
  const later = new Date(Date.now() + 86400000).toISOString();
  const ready = { status: 'active' as const, password_set_at: 'set', onboarding_completed_at: 'done', access_starts_at: later, access_expires_at: null };
  assert.equal(computeAccountStage(ready, true), 'scheduled');
  assert.equal(computeAccountStage(ready, false), 'verify_email');
  assert.equal(computeAccountStage({ ...ready, password_set_at: null }, true), 'set_password');
  assert.equal(computeAccountStage({ ...ready, status: 'suspended' }, true), 'suspended');
});

test('approval validates schedule and plan on the server, records the grant and resends without extending it', async () => {
  const { supabase } = await import('../src/services/db');
  const { config } = await import('../src/config');
  const { getSesClient } = await import('../src/aws');
  const { default: routes } = await import('../src/modules/access-requests/admin.routes');
  const { default: express } = await import('express');
  const ses = getSesClient();
  const originals = { from: supabase.from, rpc: supabase.rpc, generate: supabase.auth.admin.generateLink, getUser: supabase.auth.admin.getUserById, send: ses.send, sender: config.email.from };
  const id = '11111111-1111-4111-8111-111111111111';
  const planId = '22222222-2222-4222-8222-222222222222';
  const userId = '33333333-3333-4333-8333-333333333333';
  let role = 'super_admin';
  let isTrial = false;
  const row: any = { id, status: 'pending', email: 'grant-test@yopmail.com', full_name: 'Grant Test', business_name: 'Test', activation_send_count: 0 };
  let account: any = null;
  const grants: any[] = [];
  let sent = 0;
  (supabase as any).from = (table: string) => {
    let single = false;
    let changes: any;
    let data: any[] = table === 'access_requests' ? [row] : table === 'plans' ? [{ id: planId, slug: 'trial-period', is_active: true, is_trial: isTrial }] : table === 'customer_accounts' ? account ? [account] : [] : table === 'admin_sessions' ? [{ id: 'session', admin_user_id: 'admin', revoked_at: null, last_seen_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString() }] : table === 'admin_users' ? [{ id: 'admin', status: 'active', must_change_password: false }] : table === 'admin_role_assignments' ? [{ admin_user_id: 'admin', role }] : [];
    const q: any = { select: () => q, is: () => q, eq: (key: string, value: any) => { if (table !== 'admin_sessions') data = data.filter(r => r[key] === value); return q; }, in: (key: string, values: any[]) => { data = data.filter(r => values.includes(r[key])); return q; }, update: (value: any) => { changes = value; return q; }, insert: () => q, maybeSingle: () => { single = true; return q; }, single: () => { single = true; return q; }, then: (resolve: any, reject: any) => { if (changes) for (const value of data) Object.assign(value, changes); return Promise.resolve({ data: single ? data[0] || null : data, error: null }).then(resolve, reject); } };
    return q;
  };
  (supabase as any).rpc = async (name: string, args: any) => {
    if (name === 'auth_email_exists') return { data: false, error: null };
    if (name === 'assign_workspace_plan') { grants.push(args); account = { user_id: userId, plan_id: planId, access_months: 1 }; return { data: null, error: null }; }
    throw new Error(`Unexpected RPC ${name}`);
  };
  (supabase.auth.admin as any).generateLink = async () => ({ data: { properties: { hashed_token: 'fake-token' }, user: { id: userId } }, error: null });
  (supabase.auth.admin as any).getUserById = async () => ({ data: { user: { id: userId, email_confirmed_at: null } }, error: null });
  (ses as any).send = async () => { sent++; return { MessageId: 'mock-id' }; };
  config.email.from = 'sender@example.com';
  const app = express(); app.use(express.json()); app.use('/requests', routes);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/requests/${id}`;
  const headers = { Cookie: 'admin_session=test', Origin: config.admin.origins[0], 'Content-Type': 'application/json' };
  const post = (path: string, body: any, h = headers) => fetch(url + path, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const startDate = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);
  const expiryDate = new Date(Date.now() + 86400000 * 40).toISOString().slice(0, 10);
  try {
    assert.equal((await post('/approve', { planId }, { ...headers, Origin: 'https://other.example' })).status, 403);
    role = 'support'; assert.equal((await post('/approve', { planId })).status, 403); role = 'super_admin';
    for (const invalid of [{ planId: 'bad' }, { planId, startDate: '2027-02-29' }, { planId, startDate: '2000-01-01' }, { planId, startDate: expiryDate, expiryDate: startDate }, { planId, expiryDate: 'invalid' }]) assert.equal((await post('/approve', invalid)).status, 400);
    isTrial = true; assert.equal((await post('/approve', { planId, expiryDate })).status, 400); isTrial = false;
    assert.equal(sent, 0); assert.equal(grants.length, 0);
    assert.equal((await post('/approve', { planId, startDate, expiryDate })).status, 200);
    assert.deepEqual(grants[0], { p_user: userId, p_plan: planId, p_request: id, p_end_date: expiryDate, p_start_date: startDate });
    assert.equal(row.assigned_start_date, startDate); assert.equal(row.assigned_expiry_date, expiryDate);
    assert.equal((await post('/resend-activation', {})).status, 200);
    assert.equal(grants.length, 1); assert.equal(sent, 2);
  } finally {
    supabase.from = originals.from; supabase.rpc = originals.rpc; supabase.auth.admin.generateLink = originals.generate; supabase.auth.admin.getUserById = originals.getUser; ses.send = originals.send; config.email.from = originals.sender;
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
