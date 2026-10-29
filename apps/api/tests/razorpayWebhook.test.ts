import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHmac } from 'node:crypto';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

test('Razorpay HTTP webhook verifies raw bytes, fulfils top-ups once and safely retries unfinished payments', async () => {
  const { supabase } = await import('../src/services/db');
  const { config } = await import('../src/config');
  const { razorpayWebhook } = await import('../src/modules/billing/public.routes');
  const original = { from: supabase.from, rpc: supabase.rpc, secret: config.razorpay.webhookSecret, dograhKey: config.dograh.apiKey };
  const rows = new Map<string, any>();
  let reads = 0, activationAttempts = 0, creditedMinutes = 0, failNext = false;
  const credited = new Set<string>();
  const makeOrder = (id: string, kind = 'topup') => {
    const row = { id, customer_user_id: 'fixture-owner', provisioned_user_id: null, purchase_kind: kind,
      plan_snapshot: { name: 'Fixture plan' }, currency: 'INR', total: 400000, minutes_added: kind === 'topup' ? 500 : null,
      status: 'created', coupon_id: null, razorpay_order_id: `order_${id}`, razorpay_payment_id: null,
      full_name: 'Webhook fixture', email: 'webhook-test@example.invalid', business_name: 'Fixture',
      updated_at: new Date().toISOString() };
    rows.set(id, row); return row;
  };
  (supabase as any).from = (table: string) => {
    const predicates: Array<(row: any) => boolean> = [];
    let changes: any;
    const query: any = {
      select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { predicates.push(row => values.includes(row[key])); return query; },
      update: (value: any) => { changes = value; return query; },
      maybeSingle: () => query, single: () => query,
      then: (resolve: any, reject: any) => {
        if (table === 'admin_notification_recipients') return Promise.resolve({ data: [{ is_active: false, notify_payments: false, email: 'disabled@example.invalid' }], error: null }).then(resolve, reject);
        assert.equal(table, 'billing_orders', 'no real external services or unrelated database writes');
        reads++;
        const row = [...rows.values()].find(row => predicates.every(predicate => predicate(row)));
        if (row && changes) Object.assign(row, changes);
        return Promise.resolve({ data: row ? structuredClone(row) : null, error: null }).then(resolve, reject);
      },
    };
    return query;
  };
  (supabase as any).rpc = async (name: string, args: any) => {
    assert.equal(name, 'activate_workspace_payment'); activationAttempts++;
    if (failNext) { failNext = false; return { data: null, error: { message: 'Simulated temporary database failure' } }; }
    const row = rows.get(args.p_order)!;
    if (!credited.has(row.id)) { credited.add(row.id); creditedMinutes += row.minutes_added || 0; }
    row.status = 'provisioned'; row.provisioned_user_id = row.customer_user_id;
    return { data: true, error: null };
  };
  config.razorpay.webhookSecret = 'local-webhook-test-secret';
  config.dograh.apiKey = '';
  const app = express();
  app.post('/webhook', express.raw({ type: 'application/json' }), razorpayWebhook);
  app.use(express.json());
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/webhook`;
  const event = (row: any, type = 'payment.captured', changes = {}) => ({ event: type, payload: { payment: { entity: {
    id: `pay_${row.id}`, order_id: row.razorpay_order_id, status: 'captured', amount: row.total, currency: row.currency, ...changes,
  } } } });
  const deliver = (payload: unknown, options: { signature?: string; raw?: string } = {}) => {
    const body = options.raw ?? JSON.stringify(payload);
    const signature = options.signature ?? createHmac('sha256', config.razorpay.webhookSecret).update(body).digest('hex');
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature }, body });
  };
  try {
    const topup = makeOrder('topup');
    assert.equal((await deliver(event(topup), { signature: 'bad' })).status, 400);
    assert.equal(reads, 0); assert.equal(activationAttempts, 0);
    const signature = createHmac('sha256', config.razorpay.webhookSecret).update(JSON.stringify(event(topup))).digest('hex');
    assert.equal((await deliver(event(topup), { signature, raw: JSON.stringify(event(topup)) + ' ' })).status, 400, 'signature covers exact raw bytes');
    assert.equal((await deliver(null, { raw: '{broken-json' })).status, 400);
    assert.equal((await deliver(event(topup, 'payment.failed'))).status, 200);
    assert.equal((await deliver(event(topup, 'payment.captured', { status: 'authorized' }))).status, 400);
    assert.equal((await deliver(event(topup, 'payment.captured', { amount: 1 }))).status, 200);
    assert.equal((await deliver(event(topup, 'payment.captured', { currency: 'USD' }))).status, 200);
    assert.equal((await deliver(event(topup, 'payment.captured', { order_id: 'unknown-order' }))).status, 200);
    assert.equal(activationAttempts, 0); assert.equal(creditedMinutes, 0);
    assert.equal((await deliver(event(topup))).status, 200);
    assert.equal(topup.status, 'provisioned'); assert.equal(creditedMinutes, 500);
    assert.equal((await deliver(event(topup))).status, 200);
    assert.equal((await deliver(event(topup, 'order.paid'))).status, 200);
    assert.equal(activationAttempts, 1); assert.equal(creditedMinutes, 500, 'payment and order events cannot double credit');

    const concurrent = makeOrder('concurrent');
    const simultaneous = await Promise.all([deliver(event(concurrent)), deliver(event(concurrent))]);
    assert.ok(simultaneous.every(response => [200, 503].includes(response.status)));
    assert.equal(creditedMinutes, 1000);
    assert.equal((await deliver(event(concurrent))).status, 200);
    assert.equal(creditedMinutes, 1000);

    const retry = makeOrder('retry'); failNext = true;
    assert.equal((await deliver(event(retry))).status, 500, 'failed fulfilment must trigger provider retry');
    assert.equal(retry.status, 'paid');
    const waiting = await deliver(event(retry));
    assert.equal(waiting.status, 503); assert.equal(waiting.headers.get('retry-after'), '120');
    assert.equal(creditedMinutes, 1000);
    retry.updated_at = new Date(Date.now() - 180000).toISOString();
    assert.equal((await deliver(event(retry))).status, 200);
    assert.equal(retry.status, 'provisioned'); assert.equal(creditedMinutes, 1500);
    const changed = makeOrder('changed-plan', 'plan_change');
    assert.equal((await deliver(event(changed, 'order.paid'))).status, 200);
    assert.equal(changed.status, 'provisioned'); assert.equal(creditedMinutes, 1500);
    config.razorpay.webhookSecret = '';
    assert.equal((await deliver(event(topup), { signature })).status, 400, 'missing secret fails closed');
  } finally {
    await new Promise(resolve => setTimeout(resolve, 10));
    supabase.from = original.from; supabase.rpc = original.rpc;
    config.razorpay.webhookSecret = original.secret; config.dograh.apiKey = original.dograhKey;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
