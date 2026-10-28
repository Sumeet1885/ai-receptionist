import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { parsePlanInput } from '../src/modules/billing/validation';
import { isPurchasable, type PlanRow } from '../src/modules/billing/pricing';
import { computeAccountStage } from '../src/modules/accounts/stage';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_trial';
process.env.RAZORPAY_KEY_SECRET = 'test-secret';

test('trial plans validate whole-day bounds, hide public checkout and discard paid flags', () => {
  const input = {
    slug: 'trial-period',
    name: 'Trial Period',
    isTrial: true,
    trialDays: 14,
    isFeatured: true,
    contactSales: true,
    priceInr: 999,
  };
  const parsed = parsePlanInput(input);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.trial_days, 14);
  assert.equal(parsed.value.price_inr, 0);
  assert.equal(parsed.value.is_featured, false);
  assert.equal(parsed.value.contact_sales, false);
  assert.equal(
    isPurchasable(
      { ...parsed.value, id: 'trial', price_inr: 999 } as PlanRow,
      'INR',
    ),
    false,
  );
  for (const trialDays of [undefined, 0, -1, 366, 1.5, 'no'])
    assert.equal(parsePlanInput({ ...input, trialDays }).ok, false);
});

test('workspace expiry blocks at the exact boundary, with verification and suspension taking precedence', async () => {
  const { workspaceIsBlocked } =
    await import('../src/middleware/workspaceAccess');
  const now = Date.now();
  const account = {
    status: 'active' as const,
    password_set_at: 'set',
    onboarding_completed_at: 'done',
    access_expires_at: new Date(now).toISOString(),
  };
  assert.equal(workspaceIsBlocked(account, now), true);
  assert.equal(workspaceIsBlocked(account, now - 1), false);
  assert.equal(workspaceIsBlocked(null, now), true);
  assert.equal(
    workspaceIsBlocked({
      status: 'active',
      trial_days: 14,
      trial_started_at: null,
    }),
    true,
  );
  assert.equal(
    workspaceIsBlocked({ status: 'active' }),
    false,
    'legacy accounts keep access',
  );
  assert.equal(computeAccountStage(account, true), 'payment_required');
  assert.equal(computeAccountStage(account, false), 'verify_email');
  assert.equal(
    computeAccountStage({ ...account, status: 'suspended' }, true),
    'suspended',
  );
});

test('API denies expired workspace access but permits paid ordering for its authenticated owner at server prices', async () => {
  const { supabase } = await import('../src/services/db');
  const { requireAuth } = await import('../src/middleware/auth');
  const { requireWorkspaceAccess } =
    await import('../src/middleware/workspaceAccess');
  const { customerBillingRoutes } =
    await import('../src/modules/billing/customer.routes');
  const originalFrom = supabase.from;
  const originalAuth = supabase.auth.getUser;
  const originalFetch = globalThis.fetch;
  const plan = {
    id: 'plan',
    slug: 'paid',
    name: 'Paid',
    is_active: true,
    is_trial: false,
    contact_sales: false,
    price_inr: 10000,
    setup_fee_inr: 2000,
    price_usd: 1000,
    setup_fee_usd: 0,
  };
  let account: any = {
    user_id: 'owner',
    status: 'active',
    password_set_at: 'set',
    access_expires_at: new Date(Date.now() - 1000).toISOString(),
  };
  let inserted: any;
  (supabase as any).from = (table: string) => {
    let value: any =
      table === 'customer_accounts'
        ? account
        : table === 'plans'
          ? plan
          : inserted;
    const query: any = {
      select: () => query,
      eq: () => query,
      maybeSingle: () => query,
      single: () => query,
      insert: (row: any) => {
        inserted = { ...row, id: 'order' };
        value = inserted;
        return query;
      },
      update: (row: any) => {
        Object.assign(inserted, row);
        value = inserted;
        return query;
      },
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: value, error: null }).then(resolve, reject),
    };
    return query;
  };
  (supabase.auth as any).getUser = async () => ({
    data: {
      user: {
        id: 'owner',
        email: 'owner@example.com',
        email_confirmed_at: 'verified',
        user_metadata: {},
      },
    },
    error: null,
  });
  globalThis.fetch = (async (url: any, options: any) => {
    if (String(url).startsWith('https://api.razorpay.com/')) {
      const payload = JSON.parse(options.body);
      assert.equal(payload.amount, 12000);
      return new Response(
        JSON.stringify({
          id: 'rzp_order',
          amount: payload.amount,
          currency: payload.currency,
        }),
        { status: 200 },
      );
    }
    return originalFetch(url, options);
  }) as typeof fetch;
  const app = express();
  app.use(express.json());
  app.get('/data', requireAuth, requireWorkspaceAccess, (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/billing', customerBillingRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const headers = {
    Authorization: 'Bearer test',
    'Content-Type': 'application/json',
  };
  try {
    assert.equal((await fetch(`${base}/data`, { headers })).status, 403);
    assert.equal(
      (
        await fetch(`${base}/billing/order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
      401,
    );
    const response = await fetch(`${base}/billing/order`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        plan: 'paid',
        currency: 'INR',
        customer_user_id: 'attacker',
        total: 1,
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(inserted.customer_user_id, 'owner');
    assert.equal(inserted.total, 12000);
    assert.equal(inserted.password_hash, null);
    plan.is_trial = true;
    assert.equal(
      (
        await fetch(`${base}/billing/order`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ plan: 'paid', currency: 'INR' }),
        })
      ).status,
      404,
    );
    account.status = 'suspended';
    assert.equal(
      (
        await fetch(`${base}/billing/order`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ plan: 'paid', currency: 'INR' }),
        })
      ).status,
      403,
    );
  } finally {
    globalThis.fetch = originalFetch;
    (supabase as any).from = originalFrom;
    supabase.auth.getUser = originalAuth;
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});
