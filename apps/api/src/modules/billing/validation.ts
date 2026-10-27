// Validation of what admins submit for plans, comparison rows and coupons. Each parser returns
// either clean database columns or a map of field → message for the form.

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FEATURE_KEY = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const COUPON_CODE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Whole non-negative integer (amounts arrive in minor units), or null when blank and allowed.
function integer(value: unknown, field: string, errors: Record<string, string>, { nullable = false, min = 0, max = 2_000_000_000 } = {}) {
  if (value === null || value === undefined || value === '') {
    if (nullable) return null;
    errors[field] = 'Required.';
    return 0;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    errors[field] = `Enter a whole number${min > 0 ? ` of at least ${min}` : ''}.`;
    return 0;
  }
  return n;
}

export interface PlanColumns {
  slug: string;
  name: string;
  tagline: string | null;
  sort_order: number;
  is_active: boolean;
  is_featured: boolean;
  contact_sales: boolean;
  monthly_minutes: number | null;
  price_inr: number;
  price_usd: number;
  setup_fee_inr: number;
  setup_fee_usd: number;
  max_agents: number | null;
  max_concurrent_calls: number | null;
  feature_values: Record<string, string>;
}

export function parsePlanInput(input: unknown): Result<PlanColumns> {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const slug = text(raw.slug, 60).toLowerCase();
  if (!SLUG.test(slug)) errors.slug = 'Use lowercase letters, numbers and dashes (e.g. ai-starter).';
  const name = text(raw.name, 80);
  if (name.length < 2) errors.name = 'Enter a plan name.';

  const contactSales = raw.contactSales === true;
  const value: PlanColumns = {
    slug,
    name,
    tagline: text(raw.tagline, 200) || null,
    sort_order: integer(raw.sortOrder ?? 0, 'sortOrder', errors, { max: 10_000 }) ?? 0,
    is_active: raw.isActive !== false,
    is_featured: raw.isFeatured === true,
    contact_sales: contactSales,
    monthly_minutes: integer(raw.monthlyMinutes, 'monthlyMinutes', errors, { nullable: true, max: 10_000_000 }),
    price_inr: integer(raw.priceInr ?? 0, 'priceInr', errors) ?? 0,
    price_usd: integer(raw.priceUsd ?? 0, 'priceUsd', errors) ?? 0,
    setup_fee_inr: integer(raw.setupFeeInr ?? 0, 'setupFeeInr', errors) ?? 0,
    setup_fee_usd: integer(raw.setupFeeUsd ?? 0, 'setupFeeUsd', errors) ?? 0,
    max_agents: integer(raw.maxAgents, 'maxAgents', errors, { nullable: true, max: 10_000 }),
    max_concurrent_calls: integer(raw.maxConcurrentCalls, 'maxConcurrentCalls', errors, { nullable: true, max: 10_000 }),
    feature_values: {},
  };

  if (!contactSales && value.price_inr === 0 && value.price_usd === 0) {
    errors.priceInr = 'Set a price in at least one currency, or mark the plan as "Talk to sales".';
  }

  const features = raw.featureValues && typeof raw.featureValues === 'object' ? raw.featureValues as Record<string, unknown> : {};
  for (const [key, entry] of Object.entries(features)) {
    if (!FEATURE_KEY.test(key)) continue;
    const display = text(entry, 60);
    if (display) value.feature_values[key] = display;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export interface FeatureColumns {
  key: string;
  label: string;
  sort_order: number;
}

export function parseFeatureList(input: unknown): Result<FeatureColumns[]> {
  if (!Array.isArray(input) || input.length > 30) return { ok: false, errors: { features: 'Send up to 30 rows.' } };
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  const rows = input.map((entry, index) => {
    const raw = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const label = text(raw.label, 80);
    const key = text(raw.key, 40).toLowerCase() || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!FEATURE_KEY.test(key)) errors[`features.${index}`] = 'Each row needs a label made of letters or numbers.';
    else if (seen.has(key)) errors[`features.${index}`] = 'Two rows have the same name.';
    if (!label) errors[`features.${index}`] = 'Enter a label.';
    seen.add(key);
    return { key, label, sort_order: (index + 1) * 10 };
  });
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: rows };
}

export interface CouponColumns {
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  percent_off: number | null;
  amount_off_inr: number | null;
  amount_off_usd: number | null;
  applies_to: 'total' | 'plan' | 'setup';
  plan_ids: string[];
  max_redemptions: number | null;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
}

function date(value: unknown, field: string, errors: Record<string, string>, nullable: boolean) {
  if (value === null || value === undefined || value === '') return nullable ? null : new Date().toISOString();
  const time = Date.parse(String(value));
  if (Number.isNaN(time)) {
    errors[field] = 'Enter a valid date.';
    return null;
  }
  return new Date(time).toISOString();
}

export function parseCouponInput(input: unknown): Result<CouponColumns> {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const code = text(raw.code, 32).toUpperCase();
  if (!COUPON_CODE.test(code)) errors.code = '3–32 characters: letters, numbers, dashes or underscores.';

  const discountType = raw.discountType === 'fixed' ? 'fixed' : 'percent';
  let percentOff: number | null = null;
  let amountOffInr: number | null = null;
  let amountOffUsd: number | null = null;
  if (discountType === 'percent') {
    const n = Number(raw.percentOff);
    if (!(n > 0 && n <= 100)) errors.percentOff = 'Enter a percentage between 1 and 100.';
    else percentOff = Math.round(n * 100) / 100;
  } else {
    amountOffInr = integer(raw.amountOffInr, 'amountOffInr', errors, { nullable: true, min: 1 });
    amountOffUsd = integer(raw.amountOffUsd, 'amountOffUsd', errors, { nullable: true, min: 1 });
    if (amountOffInr === null && amountOffUsd === null && !errors.amountOffInr && !errors.amountOffUsd) {
      errors.amountOffInr = 'Enter an amount in INR, USD or both.';
    }
  }

  const appliesTo = raw.appliesTo === 'plan' || raw.appliesTo === 'setup' ? raw.appliesTo : 'total';
  const planIds = Array.isArray(raw.planIds) ? [...new Set(raw.planIds.filter((id): id is string => typeof id === 'string' && UUID.test(id)))] : [];
  const startsAt = date(raw.startsAt, 'startsAt', errors, false) ?? new Date().toISOString();
  const expiresAt = date(raw.expiresAt, 'expiresAt', errors, true);
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) errors.expiresAt = 'The end date must be after the start date.';

  const value: CouponColumns = {
    code,
    description: text(raw.description, 200) || null,
    discount_type: discountType,
    percent_off: percentOff,
    amount_off_inr: amountOffInr,
    amount_off_usd: amountOffUsd,
    applies_to: appliesTo,
    plan_ids: planIds,
    max_redemptions: integer(raw.maxRedemptions, 'maxRedemptions', errors, { nullable: true, min: 1, max: 1_000_000 }),
    starts_at: startsAt,
    expires_at: expiresAt,
    is_active: raw.isActive !== false,
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
