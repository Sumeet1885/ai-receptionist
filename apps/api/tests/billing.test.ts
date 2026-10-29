import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { computeQuote, couponProblem, formatMoney, isPurchasable, type CouponRow, type PlanRow } from '../src/modules/billing/pricing';
import { parseCouponInput, parseFeatureList, parsePlanInput } from '../src/modules/billing/validation';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

const migrationUrl = new URL('../../../supabase/migrations/20261028120000_billing.sql', import.meta.url);
const indexUrl = new URL('../src/index.ts', import.meta.url);
const adminRoutesUrl = new URL('../src/modules/billing/admin.routes.ts', import.meta.url);

const plan: PlanRow = {
  id: '11111111-1111-4111-8111-111111111111', slug: 'ai-starter', name: 'AI Starter', tagline: null, sort_order: 10,
  is_active: true, is_featured: false, contact_sales: false, monthly_minutes: 1000,
  price_inr: 799000, price_usd: 10000, setup_fee_inr: 900000, setup_fee_usd: 0,
  max_agents: 3, max_concurrent_calls: 3, feature_values: {},
};

const baseCoupon: CouponRow = {
  id: 'c1', code: 'LAUNCH20', description: null, discount_type: 'percent', percent_off: 20,
  amount_off_inr: null, amount_off_usd: null, applies_to: 'total', plan_ids: [], max_redemptions: null,
  redemption_count: 0, starts_at: '2026-01-01T00:00:00Z', expires_at: null, is_active: true,
};
const now = new Date('2026-10-28T12:00:00Z');

test('first payment is one month plus setup fee', () => {
  const quote = computeQuote(plan, 'INR', null, now);
  assert.deepEqual(quote, { currency: 'INR', planAmount: 799000, setupFee: 900000, discount: 0, total: 1699000, coupon: null });
  assert.equal(computeQuote(plan, 'USD', null, now).total, 10000);
});

test('percent and fixed coupons discount the right part and never below the base', () => {
  assert.equal(computeQuote(plan, 'INR', baseCoupon, now).discount, Math.round(1699000 * 0.2));
  assert.equal(computeQuote(plan, 'INR', { ...baseCoupon, applies_to: 'setup', percent_off: 100 }, now).total, 799000, 'setup fee waived');
  assert.equal(computeQuote(plan, 'INR', { ...baseCoupon, applies_to: 'plan', percent_off: '50.00' }, now).discount, 399500);
  const fixed: CouponRow = { ...baseCoupon, discount_type: 'fixed', percent_off: null, amount_off_inr: 100000, amount_off_usd: null };
  assert.equal(computeQuote(plan, 'INR', fixed, now).discount, 100000);
  assert.throws(() => computeQuote(plan, 'USD', fixed, now), /cannot be used for payments in USD/);
  const huge: CouponRow = { ...fixed, applies_to: 'setup', amount_off_inr: 99_000_000 };
  assert.equal(computeQuote(plan, 'INR', huge, now).discount, 900000, 'capped at the setup fee');
});

test('a coupon may not make the order free or nearly free', () => {
  assert.throws(() => computeQuote(plan, 'INR', { ...baseCoupon, percent_off: 100 }, now), /cannot be used/);
});

test('coupon rules: active window, usage limit, plan restriction', () => {
  assert.equal(couponProblem(baseCoupon, plan, 'INR', now), null);
  assert.match(couponProblem({ ...baseCoupon, is_active: false }, plan, 'INR', now)!, /no longer active/);
  assert.match(couponProblem({ ...baseCoupon, starts_at: '2027-01-01T00:00:00Z' }, plan, 'INR', now)!, /not active yet/);
  assert.match(couponProblem({ ...baseCoupon, expires_at: '2026-10-01T00:00:00Z' }, plan, 'INR', now)!, /expired/);
  assert.match(couponProblem({ ...baseCoupon, max_redemptions: 5, redemption_count: 5 }, plan, 'INR', now)!, /fully used/);
  assert.match(couponProblem({ ...baseCoupon, plan_ids: ['other'] }, plan, 'INR', now)!, /does not apply/);
  assert.equal(couponProblem({ ...baseCoupon, plan_ids: [plan.id] }, plan, 'INR', now), null);
});

test('talk-to-sales, inactive and unpriced plans cannot be bought online', () => {
  assert.equal(isPurchasable({ ...plan, contact_sales: true }, 'INR'), false);
  assert.equal(isPurchasable({ ...plan, is_active: false }, 'INR'), false);
  assert.equal(isPurchasable({ ...plan, price_usd: 0 }, 'USD'), false);
  assert.throws(() => computeQuote({ ...plan, contact_sales: true }, 'INR', null, now), /talk to our team/);
});

test('money is formatted from minor units', () => {
  assert.equal(formatMoney(799000, 'INR'), '₹7,990');
  assert.equal(formatMoney(10050, 'USD'), '$100.50');
});

test('Razorpay checkout and webhook signatures are verified with constant-time HMAC', async () => {
  const { verifyCheckoutSignature, verifyWebhookSignature } = await import('../src/modules/billing/razorpay');
  const good = createHmac('sha256', 'key_secret').update('order_1|pay_1').digest('hex');
  assert.equal(verifyCheckoutSignature('order_1', 'pay_1', good, 'key_secret'), true);
  assert.equal(verifyCheckoutSignature('order_1', 'pay_2', good, 'key_secret'), false);
  assert.equal(verifyCheckoutSignature('order_1', 'pay_1', 'not-hex', 'key_secret'), false);
  assert.equal(verifyCheckoutSignature('order_1', 'pay_1', good, ''), false, 'no secret configured → never valid');

  const body = Buffer.from('{"event":"payment.captured"}');
  const sig = createHmac('sha256', 'hook_secret').update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, sig, 'hook_secret'), true);
  assert.equal(verifyWebhookSignature(Buffer.from('{"event":"payment.failed"}'), sig, 'hook_secret'), false);
});

test('admin plan input is validated and normalised', () => {
  const ok = parsePlanInput({ slug: 'AI-Growth', name: 'AI Growth', priceInr: 1790000, priceUsd: 20000, monthlyMinutes: 2500, maxAgents: '4', featureValues: { whatsapp_lead: ' 4 ', 'Bad Key': 'x' } });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.slug, 'ai-growth');
    assert.equal(ok.value.max_agents, 4);
    assert.deepEqual(ok.value.feature_values, { whatsapp_lead: '4' });
  }
  const bad = parsePlanInput({ slug: 'no spaces!', name: '', priceInr: -1, maxAgents: 1.5 });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['maxAgents', 'name', 'priceInr', 'slug']);
  assert.equal(parsePlanInput({ slug: 'enterprise', name: 'Enterprise', contactSales: true }).ok, true, 'talk-to-sales plans need no price');
});

test('comparison rows get keys from labels and reject duplicates', () => {
  const ok = parseFeatureList([{ label: 'WhatsApp lead' }, { key: 'telephony', label: 'Telephony' }]);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.value.map((row) => row.key), ['whatsapp_lead', 'telephony']);
  assert.equal(parseFeatureList([{ label: 'Same' }, { label: 'same' }]).ok, false);
  assert.equal(parseFeatureList('nope').ok, false);
});

test('admin coupon input is validated', () => {
  const ok = parseCouponInput({ code: 'launch-20', discountType: 'percent', percentOff: 20, expiresAt: '2027-01-01' });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value.code, 'LAUNCH-20');
  assert.equal(parseCouponInput({ code: 'X', discountType: 'percent', percentOff: 120 }).ok, false);
  assert.equal(parseCouponInput({ code: 'FLAT', discountType: 'fixed' }).ok, false, 'fixed needs an amount');
  assert.equal(parseCouponInput({ code: 'FLAT500', discountType: 'fixed', amountOffInr: 50000 }).ok, true);
  assert.equal(parseCouponInput({ code: 'WINDOW', percentOff: 10, startsAt: '2027-01-02', expiresAt: '2027-01-01' }).ok, false);
});

test('billing tables are API-only and the catalogue is seeded from the plan sheet', async () => {
  const sql = await readFile(fileURLToPath(migrationUrl), 'utf8');
  for (const table of ['plans', 'plan_features', 'coupons', 'billing_orders']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`, 'i'));
  }
  assert.doesNotMatch(sql, /CREATE POLICY/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.redeem_coupon\(UUID\) TO service_role/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.redeem_coupon\(UUID\) FROM anon/i);
  assert.match(sql, /'ai-starter', 'AI Starter'[\s\S]*799000, 10000, 900000, 3, 3/);
  assert.match(sql, /'enterprise', 'Enterprise'[\s\S]*TRUE, NULL/);
});

test('webhook gets the raw body and admin billing routes are role-checked', async () => {
  const index = await readFile(fileURLToPath(indexUrl), 'utf8');
  const webhook = index.indexOf("app.post('/api/public/razorpay/webhook', express.raw(");
  const json = index.indexOf('app.use(express.json());');
  assert.ok(webhook > 0 && webhook < json, 'webhook route must be registered before express.json');

  const admin = await readFile(fileURLToPath(adminRoutesUrl), 'utf8');
  assert.match(admin, /router\.use\(adminOriginGuard\(config\.admin\.origins\)\);\s*router\.use\(requireAdminSession\);/);
  for (const route of ["post('/plans', requireAdminRole('super_admin')", "put('/plans/:id', requireAdminRole('super_admin')", "put('/features', requireAdminRole('super_admin')", "post('/coupons', requireAdminRole('super_admin')", "put('/coupons/:id', requireAdminRole('super_admin')", "get('/orders', requireAdminRole('read_only')"]) {
    assert.ok(admin.includes(`router.${route}`), route);
  }
});

test('checkout details include a password, with the same rules in the browser and the API', async () => {
  const { validateCheckoutContact } = await import('@ai-receptionist/contracts');
  const details = { fullName: 'Asha Rao', email: 'Asha@Example.com', phone: '91234 58207', businessName: 'Rao Clinic', consent: true };
  const missing = validateCheckoutContact(details);
  assert.ok('errors' in missing && missing.errors.password);
  const ok = validateCheckoutContact({ ...details, password: 'long enough secret' });
  assert.ok(ok.ok && ok.value.password === 'long enough secret' && ok.value.email === 'asha@example.com');

  const routes = await readFile(fileURLToPath(new URL('../src/modules/billing/public.routes.ts', import.meta.url)), 'utf8');
  assert.match(validateCheckoutContact({ ...details, password: 'password' }).ok ? '' : 'rejected', /rejected/, 'common passwords are refused');
  assert.match(routes, /password_hash: await bcrypt\.hash\(contact\.value\.password, 10\)/);
  assert.match(routes, /router\.post\('\/checkout\/abandoned'/);
});

test('a paid order becomes a login with the chosen password, unconfirmed until the email link', async () => {
  const fulfil = await readFile(fileURLToPath(new URL('../src/modules/billing/fulfil.ts', import.meta.url)), 'utf8');
  assert.match(fulfil, /password_hash: claimed\.password_hash!/);
  assert.match(fulfil, /email_confirm: false/);
  assert.match(fulfil, /createVerificationLink\(claimed\.email\)/);
  assert.doesNotMatch(fulfil, /createActivationLink/);
  // The hash is dropped once the order is settled.
  assert.equal((fulfil.match(/password_hash: null/g) ?? []).length, 2);

  const sql = await readFile(fileURLToPath(new URL('../../../supabase/migrations/20261028130000_paid_signup.sql', import.meta.url)), 'utf8');
  for (const column of ['password_hash', 'checkout_dismissed_at', 'payment_error']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\.billing_orders ADD COLUMN IF NOT EXISTS ${column}`));
  }
});
