import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredTopup } from '../src/lib/topupCatalogue';
import type { PublicPlan } from '../src/lib/billingApi';

test('top-up catalogue uses only explicit admin pack sizes and currency prices', () => {
  const plan = { slug: 'growth', contactSales: false, features: { topup_minutes: '750', topup_500_minutes: '3600', topup_500_minutes_usd: '45' } } as unknown as PublicPlan;
  assert.deepEqual(configuredTopup(plan, 'USD'), { plan, minutes: 750, amount: 4500 });
  assert.equal(configuredTopup(plan, 'INR')?.amount, 360000);
  assert.equal(configuredTopup({ ...plan, features: { topup_500_minutes_usd: '45' } }, 'USD'), null, 'no invented 500-minute fallback');
  assert.equal(configuredTopup({ ...plan, features: { topup_minutes: '750', topup_500_minutes: '3600' } }, 'USD'), null, 'no inferred USD price');
  assert.equal(configuredTopup({ ...plan, contactSales: true }, 'USD'), null);
  assert.equal(configuredTopup({ ...plan, features: { ...plan.features, topup_minutes: '1.5' } }, 'USD'), null);
});
