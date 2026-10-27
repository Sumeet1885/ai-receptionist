import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateNotificationRecipient } from '@ai-receptionist/contracts';
import { summariseRevenue } from '../src/modules/billing/revenue';

const read = (path: string) => readFile(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('alert recipients need a valid email and at least one kind of alert', () => {
  const ok = validateNotificationRecipient({ email: ' Sales@Example.com ', label: 'Sales', accessRequests: true });
  assert.ok(ok.ok);
  assert.equal(ok.value.email, 'sales@example.com');
  assert.equal(ok.value.notify_payments, false);
  assert.equal(ok.value.is_active, true);

  const none = validateNotificationRecipient({ email: 'ops@example.com' });
  assert.ok('errors' in none && none.errors.events);
  const bad = validateNotificationRecipient({ email: 'not-an-email', payments: true, label: 'x'.repeat(81) });
  assert.ok('errors' in bad && bad.errors.email && /at most 80/.test(bad.errors.label!));
});

test('admin alerts go through the recipient list, with super admins as the fallback', async () => {
  const notify = await read('../src/modules/notifications/notify.ts');
  assert.match(notify, /\(await recipientsFor\(event\)\) \?\? \(await listActiveSuperAdminEmails\(\)\)/);
  assert.match(await read('../src/modules/access-requests/public.routes.ts'), /sendAdminAlert\('access_requests'/);
  assert.match(await read('../src/modules/billing/fulfil.ts'), /sendAdminAlert\('payments'/);
  assert.match(await read('../src/modules/billing/public.routes.ts'), /notifyAdmins\('signup_leads'/);
  assert.doesNotMatch(await read('../src/config.ts'), /ADMIN_NOTIFICATION_EMAILS/);

  const routes = await read('../src/modules/notifications/admin.routes.ts');
  for (const route of ["router.post('/recipients'", "router.put('/recipients/:id'", "router.delete('/recipients/:id'", "router.post('/recipients/:id/test'"]) {
    assert.match(routes, new RegExp(`${route.replace(/[()/:.]/g, '\\$&')}, requireAdminRole\\('super_admin'\\)`));
  }

  const sql = await read('../../../supabase/migrations/20261028140000_admin_notifications.sql');
  assert.match(sql, /ALTER TABLE public\.admin_notification_recipients ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.admin_notification_recipients FROM anon, authenticated/);
  assert.doesNotMatch(sql, /CREATE POLICY/i);
});

test('revenue is summed per currency for this month, 30 days and all time', () => {
  const now = new Date('2026-10-28T10:00:00Z');
  const paid = [
    { total: 1_690_000, currency: 'INR' as const, paid_at: '2026-10-27T10:00:00Z', plan_snapshot: { name: 'AI Starter' } },
    { total: 3_190_000, currency: 'INR' as const, paid_at: '2026-10-01T00:00:00Z', plan_snapshot: { name: 'AI Growth' } },
    { total: 10_000, currency: 'USD' as const, paid_at: '2026-09-30T10:00:00Z', plan_snapshot: { name: 'AI Starter' } },
    { total: 1_690_000, currency: 'INR' as const, paid_at: '2026-03-01T10:00:00Z', plan_snapshot: { name: 'AI Starter' } },
  ];
  const leads = [
    { created_at: '2026-10-26T10:00:00Z', checkout_dismissed_at: '2026-10-26T10:05:00Z', payment_error: null },
    { created_at: '2026-10-25T10:00:00Z', checkout_dismissed_at: null, payment_error: 'Card declined' },
    { created_at: '2026-01-01T10:00:00Z', checkout_dismissed_at: null, payment_error: null },
  ];
  const summary = summariseRevenue(paid, leads, now);

  assert.deepEqual(summary.totals.thisMonth, { INR: 4_880_000, USD: 0 });
  assert.deepEqual(summary.totals.last30Days, { INR: 4_880_000, USD: 10_000 });
  assert.deepEqual(summary.totals.allTime, { INR: 6_570_000, USD: 10_000 });
  assert.deepEqual(summary.counts, { allTime: 4, thisMonth: 2, last30Days: 3 });
  assert.equal(summary.monthly.length, 6);
  assert.equal(summary.monthly.at(-1)!.month, '2026-10');
  assert.equal(summary.byPlan[0].plan, 'AI Starter');
  assert.deepEqual(summary.leads, { open: 3, closed: 1, failed: 1, last30Days: 2 });
  assert.equal(summary.conversionLast30Days, 60);
  assert.equal(summariseRevenue([], [], now).conversionLast30Days, null);
});

test('months follow India time', () => {
  // 31 Oct 20:00 UTC is already 1 Nov in India.
  const summary = summariseRevenue([{ total: 100, currency: 'INR', paid_at: '2026-10-31T20:00:00Z', plan_snapshot: null }], [], new Date('2026-11-02T00:00:00Z'));
  assert.equal(summary.totals.thisMonth.INR, 100);
  assert.equal(summary.byPlan[0].plan, 'Unknown plan');
});
