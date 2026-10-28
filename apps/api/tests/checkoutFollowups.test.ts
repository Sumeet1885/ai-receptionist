import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

test('follow-up resume tokens are scoped to one order, expire, and survive another accepted send', async () => {
  const { supabase } = await import('../src/services/db');
  const { validFollowupResume } = await import('../src/modules/billing/followups');
  const original = supabase.from;
  const first = 'first_abcdefghijklmnopqrstuvwxyz012345';
  const second = 'second_abcdefghijklmnopqrstuvwxyz012345';
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const rows = [first, second].map((token, index) => ({
    id: `email-${index}`,
    order_id: 'order-a',
    token_hash: hash(token),
    status: 'sent',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }));
  (supabase as any).from = () => {
    let selected = [...rows];
    const query: any = {
      select: () => query,
      maybeSingle: () => query,
      eq: (key: keyof (typeof rows)[number], value: string) => {
        selected = selected.filter((row) => row[key] === value);
        return query;
      },
      in: (key: keyof (typeof rows)[number], values: string[]) => {
        selected = selected.filter((row) => values.includes(row[key]));
        return query;
      },
      gt: (key: keyof (typeof rows)[number], value: string) => {
        selected = selected.filter((row) => row[key] > value);
        return query;
      },
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: selected[0] || null, error: null }).then(resolve, reject),
    };
    return query;
  };
  const order: any = { id: 'order-a', resume_token_hash: null, reminder_sent_at: null };
  try {
    assert.equal(await validFollowupResume(order, first), true);
    assert.equal(await validFollowupResume(order, second), true);
    assert.equal(await validFollowupResume({ ...order, id: 'other-order' }, first), false);
    assert.equal(await validFollowupResume(order, `${first}bad`), false);
    rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
    assert.equal(await validFollowupResume(order, first), false);
    rows[1].status = 'failed';
    assert.equal(await validFollowupResume(order, second), false);
  } finally {
    (supabase as any).from = original;
  }
});

test('checkout emails use distinct status copy, escape content and avoid unusable payment links', async () => {
  const { followupContent } = await import('../src/modules/billing/followups');
  const { config } = await import('../src/config');
  const keys = { ...config.razorpay };
  config.razorpay.keyId = 'test';
  config.razorpay.keySecret = 'test';
  const base: any = {
    id: 'order',
    full_name: '<script>bad</script>',
    business_name: 'Clinic',
    email: 'lead@example.com',
    status: 'created',
    total: 12000,
    currency: 'INR',
    plan_snapshot: { name: 'Starter' },
    razorpay_order_id: 'rzp_order',
    password_hash: 'saved-password-hash',
  };
  try {
    const started = followupContent(base, 'token');
    const closed = followupContent({ ...base, checkout_dismissed_at: 'yesterday' }, 'token');
    const failed = followupContent({ ...base, payment_error: 'Secret provider response' }, 'token');
    assert.equal(new Set([started.subject, closed.subject, failed.subject]).size, 3);
    assert.equal(failed.stage, 'failed');
    assert.ok(failed.text.includes('Retry my payment'));
    assert.ok(!failed.html.includes('<script>'));
    assert.ok(!failed.text.includes('Secret provider response'));
    assert.ok(failed.text.includes('If your bank shows a debit'));
    assert.ok(started.text.includes('checkout?resume='));
    const dummy = followupContent({ ...base, razorpay_order_id: null });
    assert.equal(dummy.canResume, false);
    assert.ok(dummy.text.includes('Continue to checkout'));
    assert.ok(!dummy.text.includes('checkout?resume='));
    const dummyEmail = followupContent({ ...base, razorpay_order_id: null }, 'private-email-token');
    assert.ok(
      dummyEmail.text.includes('checkout?resume='),
      'Actual email opens prefilled checkout even without a payment order',
    );
    const workspace = followupContent({ ...base, customer_user_id: 'owner' });
    assert.ok(workspace.text.includes('/dashboard'));
    assert.ok(workspace.text.includes('Open my workspace'));
  } finally {
    Object.assign(config.razorpay, keys);
  }
});

test('resume endpoint returns a saved payment or prefilled required details, never a password hash', async () => {
  const { supabase } = await import('../src/services/db');
  const { config } = await import('../src/config');
  const { default: router } = await import('../src/modules/billing/public.routes');
  const originalFrom = supabase.from;
  const keys = { ...config.razorpay };
  config.razorpay.keyId = 'test';
  config.razorpay.keySecret = 'test';
  const token = 'resume_abcdefghijklmnopqrstuvwxyz012345';
  const order: any = {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'created',
    full_name: 'Asha',
    email: 'asha@yopmail.com',
    phone: '',
    business_name: 'Clinic',
    currency: 'INR',
    total: 12000,
    plan_amount: 10000,
    setup_fee: 2000,
    discount: 0,
    coupon_code: null,
    password_hash: 'private-password-hash',
    razorpay_order_id: 'rzp_saved',
    resume_token_hash: createHash('sha256').update(token).digest('hex'),
    reminder_sent_at: new Date().toISOString(),
    plan_snapshot: {
      slug: 'old-plan',
      name: 'Saved plan',
      price_inr: 10000,
      price_usd: 0,
      setup_fee_inr: 2000,
      setup_fee_usd: 0,
    },
  };
  const active = {
    id: 'active',
    slug: 'active-plan',
    name: 'Available plan',
    is_active: true,
    is_trial: false,
    contact_sales: false,
    price_inr: 20000,
    price_usd: 0,
    setup_fee_inr: 3000,
    setup_fee_usd: 0,
  };
  (supabase as any).from = (table: string) => {
    let single = false;
    let rows = table === 'billing_orders' ? [order] : table === 'plans' ? [active] : [];
    const q: any = {
      select: () => q,
      order: () => q,
      maybeSingle: () => {
        single = true;
        return q;
      },
      eq: (key: string, value: any) => {
        rows = rows.filter((row: any) => row[key] === value);
        return q;
      },
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(resolve, reject),
    };
    return q;
  };
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/checkout/resume`;
  const resume = (input = `${order.id}.${token}`) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume: input, total: 1, email: 'attacker@example.com' }),
    });
  try {
    const saved = (await (await resume()).json()) as any;
    assert.equal(saved.requiresDetails, false);
    assert.equal(saved.order.razorpayOrderId, 'rzp_saved');
    assert.equal(saved.order.amount, 12000);
    assert.equal(saved.order.prefill.email, order.email);
    assert.ok(!JSON.stringify(saved).includes('private-password-hash'));
    order.password_hash = null;
    order.razorpay_order_id = null;
    const setup = (await (await resume()).json()) as any;
    assert.equal(setup.requiresDetails, true);
    assert.equal(setup.order, null);
    assert.equal(setup.contact.email, order.email);
    assert.equal(setup.plan.slug, 'active-plan');
    assert.equal(setup.quote.total, 23000);
    assert.equal(setup.contact.password, undefined);
    for (const status of ['paid', 'provisioned', 'review']) {
      order.status = status;
      const repeated = await resume();
      assert.equal(repeated.status, 409);
      const body = await repeated.json() as any;
      assert.equal(body.code, 'order_paid');
      assert.equal(body.paid, true);
    }
    order.status = 'failed';
    const failed = await resume();
    assert.equal(failed.status, 409);
    const failure = await failed.json() as any;
    assert.equal(failure.code, 'order_unavailable');
    assert.equal(failure.paid, undefined);
    assert.equal((await resume(`${order.id}.wrong`)).status, 404);
  } finally {
    (supabase as any).from = originalFrom;
    Object.assign(config.razorpay, keys);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('admin email preview/send enforces role, CSRF, current status, server recipient, SES success and retryable failure', async () => {
  const { supabase } = await import('../src/services/db');
  const { config } = await import('../src/config');
  const { getSesClient } = await import('../src/aws');
  const { default: router } = await import('../src/modules/billing/admin.routes');
  const ses = getSesClient();
  const original = { from: supabase.from, rpc: supabase.rpc, send: ses.send, emailFrom: config.email.from };
  config.email.from = 'test@example.com';
  let role = 'support';
  let fail = false;
  let sends = 0;
  let claimReason: string | null = null;
  const finished: any[] = [];
  let command: any;
  const id = '11111111-1111-4111-8111-111111111111';
  const order: any = {
    id,
    status: 'created',
    full_name: 'Customer',
    business_name: 'Clinic',
    email: 'real-lead@yopmail.com',
    currency: 'INR',
    total: 12000,
    plan_snapshot: { name: 'Starter' },
    payment_error: 'Failed',
    razorpay_order_id: null,
  };
  (supabase as any).from = (table: string) => {
    let single = false;
    let rows: any[] =
      table === 'billing_orders'
        ? [order]
        : table === 'admin_sessions'
          ? [
              {
                id: 'session',
                admin_user_id: 'admin',
                revoked_at: null,
                expires_at: new Date(Date.now() + 3600000).toISOString(),
                last_seen_at: new Date().toISOString(),
              },
            ]
          : table === 'admin_users'
            ? [{ id: 'admin', display_name: 'Admin', status: 'active', must_change_password: false }]
            : table === 'admin_role_assignments'
              ? [{ admin_user_id: 'admin', role }]
              : [];
    const builder: any = {
      select: () => builder,
      is: () => builder,
      maybeSingle: () => {
        single = true;
        return builder;
      },
      insert: () => builder,
      eq: (key: string, value: any) => {
        if (table !== 'admin_sessions') rows = rows.filter((row) => row[key] === value);
        return builder;
      },
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(resolve, reject),
    };
    return builder;
  };
  (supabase as any).rpc = async (name: string, args: any) => {
    if (name === 'claim_checkout_followup')
      return {
        data: claimReason ? { reason: claimReason } : { id: 'send-id', stage: 'failed' },
        error: null,
      };
    finished.push(args);
    return { data: true, error: null };
  };
  ses.send = (async (input: any) => {
    sends++;
    command = input.input;
    if (fail) throw new Error('SES unavailable');
    return { MessageId: 'accepted-id' };
  }) as any;
  const app = express();
  app.use(express.json());
  app.use('/billing', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/billing/orders/${id}`;
  const headers = {
    Cookie: 'admin_session=test',
    Origin: config.admin.origins[0],
    'Content-Type': 'application/json',
  };
  const send = (body: any, inputHeaders: Record<string, string> = headers) =>
    fetch(`${base}/send-email`, { method: 'POST', headers: inputHeaders, body: JSON.stringify(body) });
  try {
    assert.equal(
      (await send({ stage: 'failed' }, { Origin: headers.Origin, 'Content-Type': 'application/json' }))
        .status,
      401,
    );
    assert.equal(
      (await send({ stage: 'failed' }, { ...headers, Origin: 'https://evil.example' })).status,
      403,
    );
    role = 'read_only';
    assert.equal((await send({ stage: 'failed' })).status, 403);
    assert.equal((await fetch(`${base}/email-preview`, { headers })).status, 403);
    role = 'support';
    const preview: any = await (await fetch(`${base}/email-preview`, { headers })).json();
    assert.equal(preview.stage, 'failed');
    assert.equal(preview.to, order.email);
    assert.equal(sends, 0);
    assert.equal((await send({ stage: 'started' })).status, 409);
    assert.equal((await send({ stage: 'unknown' })).status, 400);
    const response = await send({ stage: 'failed', email: 'attacker@example.com', html: 'injected' });
    assert.equal(response.status, 200);
    assert.equal(sends, 1);
    assert.deepEqual(command.Destination.ToAddresses, [order.email]);
    assert.equal(command.EmailTags[0].Value, 'checkout_followup_failed');
    assert.equal(finished[0].p_sent, true);
    assert.equal(finished[0].p_message_id, 'accepted-id');
    claimReason = 'cooldown';
    assert.equal((await send({ stage: 'failed' })).status, 409);
    assert.equal(sends, 1);
    claimReason = null;
    fail = true;
    assert.equal((await send({ stage: 'failed' })).status, 502);
    assert.equal(finished.at(-1).p_sent, false);
    order.status = 'provisioned';
    assert.equal((await send({ stage: 'failed' })).status, 409);
  } finally {
    (supabase as any).from = original.from;
    (supabase as any).rpc = original.rpc;
    ses.send = original.send;
    config.email.from = original.emailFrom;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
