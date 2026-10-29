// Server-side prices and discounts. The browser never sends an amount; it only names a plan, a
// currency and an optional coupon code, and every total comes from here. Amounts are minor units
// (paise for INR, cents for USD).

export type Currency = 'INR' | 'USD';
export const CURRENCIES: Currency[] = ['INR', 'USD'];

// Razorpay's smallest chargeable amount (₹1.00 / $0.50); a coupon may not bring the total below it.
export const MINIMUM_CHARGE: Record<Currency, number> = { INR: 100, USD: 50 };

export interface PlanRow {
  is_trial?: boolean;
  trial_days?: number | null;
  id: string;
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

export interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  percent_off: number | string | null;
  amount_off_inr: number | null;
  amount_off_usd: number | null;
  applies_to: 'total' | 'plan' | 'setup';
  plan_ids: string[];
  max_redemptions: number | null;
  redemption_count: number;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export interface Quote {
  currency: Currency;
  planAmount: number;
  setupFee: number;
  discount: number;
  total: number;
  coupon: { id: string; code: string; description: string | null } | null;
}

export function formatMoney(minor: number, currency: Currency) {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

export function planPrice(plan: PlanRow, currency: Currency) {
  return currency === 'INR'
    ? { planAmount: plan.price_inr, setupFee: plan.setup_fee_inr }
    : { planAmount: plan.price_usd, setupFee: plan.setup_fee_usd };
}

/** Whether a plan can be bought online in this currency (Enterprise and unpriced plans cannot). */
export function isPurchasable(plan: PlanRow, currency: Currency) {
  if (plan.is_trial) return false;
  return plan.is_active && !plan.contact_sales && planPrice(plan, currency).planAmount > 0;
}

/** Why a coupon cannot be used for this plan and currency, or null when it can. */
export function couponProblem(coupon: CouponRow, plan: PlanRow, currency: Currency, now = new Date()): string | null {
  if (!coupon.is_active) return 'This coupon is no longer active.';
  if (Date.parse(coupon.starts_at) > now.getTime()) return 'This coupon is not active yet.';
  if (coupon.expires_at && Date.parse(coupon.expires_at) <= now.getTime()) return 'This coupon has expired.';
  if (coupon.max_redemptions !== null && coupon.redemption_count >= coupon.max_redemptions) return 'This coupon has been fully used.';
  if (coupon.plan_ids.length > 0 && !coupon.plan_ids.includes(plan.id)) return 'This coupon does not apply to this plan.';
  if (coupon.discount_type === 'fixed') {
    const amount = currency === 'INR' ? coupon.amount_off_inr : coupon.amount_off_usd;
    if (!amount) return `This coupon cannot be used for payments in ${currency}.`;
  }
  return null;
}

function discountFor(coupon: CouponRow, base: number, currency: Currency) {
  if (base <= 0) return 0;
  if (coupon.discount_type === 'percent') {
    return Math.min(base, Math.round((base * Number(coupon.percent_off)) / 100));
  }
  const amount = (currency === 'INR' ? coupon.amount_off_inr : coupon.amount_off_usd) ?? 0;
  return Math.min(base, amount);
}

/**
 * First payment for a plan: one month plus the one-time setup fee, less the coupon discount.
 * Throws a user-facing Error when the coupon cannot be used or the plan cannot be bought.
 */
export function computeQuote(plan: PlanRow, currency: Currency, coupon: CouponRow | null, now = new Date()): Quote {
  if (!isPurchasable(plan, currency)) throw new Error('This plan cannot be bought online. Please talk to our team.');
  const { planAmount, setupFee } = planPrice(plan, currency);

  let discount = 0;
  if (coupon) {
    const problem = couponProblem(coupon, plan, currency, now);
    if (problem) throw new Error(problem);
    const base = coupon.applies_to === 'plan' ? planAmount : coupon.applies_to === 'setup' ? setupFee : planAmount + setupFee;
    discount = discountFor(coupon, base, currency);
  }

  const total = planAmount + setupFee - discount;
  if (total < MINIMUM_CHARGE[currency]) throw new Error('This coupon cannot be used for this order.');

  return {
    currency,
    planAmount,
    setupFee,
    discount,
    total,
    coupon: coupon && discount > 0 ? { id: coupon.id, code: coupon.code, description: coupon.description } : null,
  };
}
