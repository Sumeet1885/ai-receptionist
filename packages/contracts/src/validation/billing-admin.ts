import { asRecord, cleanLine, dateField, done, integerField, optionalText, requiredText, type FieldErrors, type Validated } from './fields';
import { LIMITS } from './limits';

// What admins submit for plans, comparison rows and coupons. The admin console runs these before
// saving (field messages next to each input) and the API runs them again; the result is the
// database columns. Amounts are minor units.

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FEATURE_KEY = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const COUPON_CODE = /^[A-Z0-9][A-Z0-9_-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export function parsePlanInput(input: unknown): Validated<PlanColumns> {
  const raw = asRecord(input);
  const errors: FieldErrors = {};

  const slug = requiredText(errors, 'slug', raw.slug, 'a slug', LIMITS.planSlug).toLowerCase();
  if (slug && !errors.slug && !SLUG.test(slug)) errors.slug = 'Use lowercase letters, numbers and dashes (e.g. ai-starter).';
  const name = requiredText(errors, 'name', raw.name, 'a plan name', LIMITS.planName);

  const money = (field: string) => integerField(errors, field, raw[field] ?? 0, LIMITS.amount) ?? 0;
  const contactSales = raw.contactSales === true;
  const value: PlanColumns = {
    slug,
    name,
    tagline: optionalText(errors, 'tagline', raw.tagline, 'the tagline', LIMITS.planTagline),
    sort_order: integerField(errors, 'sortOrder', raw.sortOrder ?? 0, LIMITS.planSortOrder) ?? 0,
    is_active: raw.isActive !== false,
    is_featured: raw.isFeatured === true,
    contact_sales: contactSales,
    monthly_minutes: integerField(errors, 'monthlyMinutes', raw.monthlyMinutes, { ...LIMITS.planMinutes, nullable: true }),
    price_inr: money('priceInr'),
    price_usd: money('priceUsd'),
    setup_fee_inr: money('setupFeeInr'),
    setup_fee_usd: money('setupFeeUsd'),
    max_agents: integerField(errors, 'maxAgents', raw.maxAgents, { ...LIMITS.planSeats, nullable: true }),
    max_concurrent_calls: integerField(errors, 'maxConcurrentCalls', raw.maxConcurrentCalls, { ...LIMITS.planSeats, nullable: true }),
    feature_values: {},
  };

  if (!contactSales && !errors.priceInr && !errors.priceUsd && value.price_inr === 0 && value.price_usd === 0) {
    errors.priceInr = 'Set a price in at least one currency, or mark the plan as "Talk to sales".';
  }

  // Values for the comparison rows; keys that are not row keys are ignored.
  for (const [key, entry] of Object.entries(asRecord(raw.featureValues))) {
    if (!FEATURE_KEY.test(key)) continue;
    const display = optionalText(errors, `featureValues.${key}`, entry, 'this value', LIMITS.featureValue);
    if (display) value.feature_values[key] = display;
  }

  return done(errors, value);
}

export interface FeatureColumns {
  key: string;
  label: string;
  sort_order: number;
}

export function parseFeatureList(input: unknown): Validated<FeatureColumns[]> {
  if (!Array.isArray(input)) return { ok: false, errors: { features: 'Send a list of rows.' } };
  if (input.length > LIMITS.featureRows.max) return { ok: false, errors: { features: `Use at most ${LIMITS.featureRows.max} rows.` } };

  const errors: FieldErrors = {};
  const seen = new Set<string>();
  const rows = input.map((entry, index) => {
    const raw = asRecord(entry);
    const field = `features.${index}`;
    const label = requiredText(errors, field, raw.label, 'a label', LIMITS.featureLabel);
    const key = cleanLine(raw.key).toLowerCase().slice(0, LIMITS.featureKey.max)
      || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, LIMITS.featureKey.max);
    if (!errors[field]) {
      if (!FEATURE_KEY.test(key)) errors[field] = 'Each row needs a label made of letters or numbers.';
      else if (seen.has(key)) errors[field] = 'Two rows have the same name.';
    }
    seen.add(key);
    return { key, label, sort_order: (index + 1) * 10 };
  });
  return done(errors, rows);
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

export function parseCouponInput(input: unknown): Validated<CouponColumns> {
  const raw = asRecord(input);
  const errors: FieldErrors = {};

  const code = requiredText(errors, 'code', raw.code, 'a code', LIMITS.couponCode).toUpperCase();
  if (code && !errors.code && !COUPON_CODE.test(code)) errors.code = 'Use letters, numbers, dashes or underscores, starting with a letter or number.';

  const discountType = raw.discountType === 'fixed' ? 'fixed' : 'percent';
  let percentOff: number | null = null;
  let amountOffInr: number | null = null;
  let amountOffUsd: number | null = null;
  if (discountType === 'percent') {
    const n = Number(raw.percentOff);
    const { min, max } = LIMITS.couponPercent;
    if (raw.percentOff === '' || raw.percentOff == null || !(n >= min && n <= max)) errors.percentOff = `Enter a percentage between 1 and ${max}.`;
    else percentOff = Math.round(n * 100) / 100;
  } else {
    const amount = { min: 1, max: LIMITS.amount.max, nullable: true };
    amountOffInr = integerField(errors, 'amountOffInr', raw.amountOffInr, amount);
    amountOffUsd = integerField(errors, 'amountOffUsd', raw.amountOffUsd, amount);
    if (amountOffInr === null && amountOffUsd === null && !errors.amountOffInr && !errors.amountOffUsd) {
      errors.amountOffInr = 'Enter an amount in INR, USD or both.';
    }
  }

  const appliesTo = raw.appliesTo === 'plan' || raw.appliesTo === 'setup' ? raw.appliesTo : 'total';
  const planIds = Array.isArray(raw.planIds) ? [...new Set(raw.planIds.filter((id): id is string => typeof id === 'string' && UUID.test(id)))] : [];
  const startsAt = dateField(errors, 'startsAt', raw.startsAt, { nullable: false }) ?? new Date().toISOString();
  const expiresAt = dateField(errors, 'expiresAt', raw.expiresAt, { nullable: true });
  if (expiresAt && !errors.startsAt && Date.parse(expiresAt) <= Date.parse(startsAt)) errors.expiresAt = 'The end date must be after the start date.';

  return done(errors, {
    code,
    description: optionalText(errors, 'description', raw.description, 'the note', LIMITS.couponDescription),
    discount_type: discountType,
    percent_off: percentOff,
    amount_off_inr: amountOffInr,
    amount_off_usd: amountOffUsd,
    applies_to: appliesTo,
    plan_ids: planIds,
    max_redemptions: integerField(errors, 'maxRedemptions', raw.maxRedemptions, { ...LIMITS.couponRedemptions, nullable: true }),
    starts_at: startsAt,
    expires_at: expiresAt,
    is_active: raw.isActive !== false,
  });
}
