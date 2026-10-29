import test from 'node:test';
import assert from 'node:assert/strict';
import { summariseRevenue } from '../src/modules/billing/revenue';
import { parsePlanInput } from '@ai-receptionist/contracts';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

test('admin top-up fields accept currency prices or blank and reject invalid monetary text', () => {
  const base = { slug: 'test-plan', name: 'Test plan', priceInr: 10000, monthlyMinutes: 1000 };
  const good = parsePlanInput({ ...base, featureValues: { topup_500_minutes: '4000', topup_500_minutes_usd: '48.25' } });
  assert.equal(good.ok, true);
  const blank = parsePlanInput({ ...base, featureValues: { topup_500_minutes: '', topup_500_minutes_usd: '' } });
  assert.equal(blank.ok, true);
  if (blank.ok) assert.equal(blank.value.feature_values.topup_500_minutes, undefined);
  for (const price of ['-1', '0', '4.123', '₹4000', '1000001']) {
    const result = parsePlanInput({ ...base, featureValues: { topup_500_minutes: price } });
    assert.equal(result.ok, false, price);
    if (!result.ok) assert.ok(result.errors['featureValues.topup_500_minutes']);
  }
});

test('top-up prices use validated admin values and never guess an exchange rate', async () => {
  const { topupOffer } = await import('../src/modules/billing/minutes');
  assert.deepEqual(topupOffer({ topup_500_minutes: '4000' }, 'INR'), { minutes: 500, amount: 400000, currency: 'INR' });
  assert.deepEqual(topupOffer({ topup_minutes: '750', topup_500_minutes: '4000' }, 'INR'), { minutes: 750, amount: 400000, currency: 'INR' });
  for (const value of ['', '0', '-1', '1.5', '100001']) assert.equal(topupOffer({ topup_minutes: value, topup_500_minutes: '4000' }, 'INR'), null);
  assert.equal(topupOffer({ topup_500_minutes: '4000' }, 'USD'), null);
  assert.deepEqual(topupOffer({ topup_500_minutes_usd: '48.25' }, 'USD'), { minutes: 500, amount: 4825, currency: 'USD' });
  for (const value of ['0', '-1', 'NaN', 'Infinity', '40.123', '₹4000', '1e9', '999999999999999999999']) assert.equal(topupOffer({ topup_500_minutes: value }, 'INR'), null, value);
});

test('top-ups and plan changes increase revenue without inflating signup conversion', () => {
  const now = new Date('2026-10-29T10:00:00Z');
  const base = { total: 10000, currency: 'INR' as const, paid_at: now.toISOString(), plan_snapshot: { name: 'Starter' } };
  const result = summariseRevenue([{ ...base, purchase_kind: 'initial' }, { ...base, purchase_kind: 'topup' }, { ...base, purchase_kind: 'plan_change' }], [{ created_at: now.toISOString(), checkout_dismissed_at: null, payment_error: null }], now);
  assert.equal(result.totals.allTime.INR, 30000);
  assert.equal(result.counts.allTime, 3);
  assert.equal(result.conversionLast30Days, 50);
});
