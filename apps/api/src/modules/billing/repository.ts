import { supabase } from '../../services/db';
import type { CouponRow, Currency, PlanRow } from './pricing';
import type { CouponColumns, FeatureColumns, PlanColumns } from './validation';

// The only place that queries plans, plan_features, coupons and billing_orders (service role).

export type OrderStatus = 'created' | 'paid' | 'provisioned' | 'failed' | 'review';

export interface BillingOrderRow {
  id: string;
  plan_id: string;
  plan_snapshot: PlanRow;
  currency: Currency;
  plan_amount: number;
  setup_fee: number;
  discount: number;
  total: number;
  coupon_id: string | null;
  coupon_code: string | null;
  full_name: string;
  email: string;
  phone: string;
  business_name: string;
  status: OrderStatus;
  failure_reason: string | null;
  password_hash: string | null;
  checkout_dismissed_at: string | null;
  payment_error: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  paid_at: string | null;
  provisioned_user_id: string | null;
  provisioned_at: string | null;
  created_at: string;
  updated_at: string;
}

function check<T>(result: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (result.error) throw Object.assign(new Error(`${what}: ${result.error.message}`), { code: result.error.code });
  return result.data;
}

const now = () => new Date().toISOString();

// ── plans and comparison rows ────────────────────────────────────────────────

export async function listPlans({ activeOnly }: { activeOnly: boolean }) {
  let query = supabase.from('plans').select('*').order('sort_order').order('created_at');
  if (activeOnly) query = query.eq('is_active', true);
  return (check(await query, 'list plans') ?? []) as PlanRow[];
}

export async function getPlanBySlug(slug: string) {
  return check(await supabase.from('plans').select('*').eq('slug', slug).maybeSingle<PlanRow>(), 'get plan');
}

export async function createPlan(columns: PlanColumns) {
  const result = await supabase.from('plans').insert(columns).select('*').single<PlanRow>();
  if (result.error?.code === '23505') return null;
  return check(result, 'create plan');
}

export async function updatePlan(id: string, columns: PlanColumns) {
  const result = await supabase.from('plans').update({ ...columns, updated_at: now() }).eq('id', id).select('*').maybeSingle<PlanRow>();
  if (result.error?.code === '23505') throw Object.assign(new Error('slug taken'), { code: '23505' });
  return check(result, 'update plan');
}

export async function listFeatures() {
  return (check(await supabase.from('plan_features').select('key,label,sort_order').order('sort_order'), 'list plan features') ?? []) as FeatureColumns[];
}

// Replaces the whole list: rows not sent are removed, the rest are upserted in the given order.
export async function replaceFeatures(rows: FeatureColumns[]) {
  const keep = rows.map((row) => row.key);
  let remove = supabase.from('plan_features').delete();
  remove = keep.length ? remove.not('key', 'in', `(${keep.join(',')})`) : remove.neq('key', '');
  check(await remove, 'remove plan features');
  if (rows.length) check(await supabase.from('plan_features').upsert(rows, { onConflict: 'key' }), 'save plan features');
  return listFeatures();
}

// ── coupons ──────────────────────────────────────────────────────────────────

export async function listCoupons() {
  return (check(await supabase.from('coupons').select('*').order('created_at', { ascending: false }), 'list coupons') ?? []) as CouponRow[];
}

export async function getCouponByCode(code: string) {
  return check(await supabase.from('coupons').select('*').eq('code', code.trim().toUpperCase()).maybeSingle<CouponRow>(), 'get coupon');
}

export async function createCoupon(columns: CouponColumns, createdBy: string) {
  const result = await supabase.from('coupons').insert({ ...columns, created_by: createdBy }).select('*').single<CouponRow>();
  if (result.error?.code === '23505') return null;
  return check(result, 'create coupon');
}

export async function updateCoupon(id: string, columns: Partial<CouponColumns>) {
  const result = await supabase.from('coupons').update({ ...columns, updated_at: now() }).eq('id', id).select('*').maybeSingle<CouponRow>();
  if (result.error?.code === '23505') throw Object.assign(new Error('code taken'), { code: '23505' });
  return check(result, 'update coupon');
}

export async function redeemCoupon(couponId: string) {
  return Boolean(check(await supabase.rpc('redeem_coupon', { p_coupon_id: couponId }), 'redeem coupon'));
}

// ── orders ───────────────────────────────────────────────────────────────────

export async function insertOrder(row: Omit<BillingOrderRow, 'id' | 'status' | 'failure_reason' | 'checkout_dismissed_at' | 'payment_error' | 'razorpay_order_id' | 'razorpay_payment_id' | 'paid_at' | 'provisioned_user_id' | 'provisioned_at' | 'created_at' | 'updated_at'> & { ip: string; user_agent: string | null }) {
  return check(await supabase.from('billing_orders').insert(row).select('*').single<BillingOrderRow>(), 'create order');
}

export async function getOrder(id: string) {
  return check(await supabase.from('billing_orders').select('*').eq('id', id).maybeSingle<BillingOrderRow>(), 'get order');
}

export async function getOrderByRazorpayOrderId(razorpayOrderId: string) {
  return check(await supabase.from('billing_orders').select('*').eq('razorpay_order_id', razorpayOrderId).maybeSingle<BillingOrderRow>(), 'get order');
}

export async function updateOrder(id: string, changes: Partial<BillingOrderRow>) {
  return check(await supabase.from('billing_orders').update({ ...changes, updated_at: now() }).eq('id', id).select('*').single<BillingOrderRow>(), 'update order');
}

// Compare-and-set on status, so the checkout callback and the webhook cannot both act on one payment.
export async function transitionOrder(id: string, from: OrderStatus[], changes: Partial<BillingOrderRow>) {
  return check(
    await supabase.from('billing_orders').update({ ...changes, updated_at: now() }).eq('id', id).in('status', from).select('*').maybeSingle<BillingOrderRow>(),
    'update order',
  );
}

export async function findLatestProvisionedOrderByEmail(email: string) {
  return check(
    await supabase
      .from('billing_orders')
      .select('*')
      .eq('email', email)
      .eq('status', 'provisioned')
      .order('provisioned_at', { ascending: false })
      .limit(1)
      .maybeSingle<BillingOrderRow>(),
    'find provisioned order',
  );
}

export async function listOrders(filters: { status?: OrderStatus; page: number; pageSize: number }) {
  let query = supabase
    .from('billing_orders')
    .select('id,status,currency,total,discount,coupon_code,full_name,email,phone,business_name,plan_snapshot,razorpay_payment_id,paid_at,created_at,failure_reason,checkout_dismissed_at,payment_error', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize - 1);
  if (filters.status) query = query.eq('status', filters.status);
  const { data, error, count } = await query;
  if (error) throw new Error(`list orders: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function setCustomerPlan(userId: string, order: BillingOrderRow) {
  const started = new Date();
  const periodEnd = new Date(started);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  check(
    await supabase
      .from('customer_accounts')
      .update({
        plan_id: order.plan_id,
        plan_currency: order.currency,
        plan_started_at: started.toISOString(),
        current_period_end: periodEnd.toISOString(),
        billing_order_id: order.id,
        updated_at: now(),
      })
      .eq('user_id', userId),
    'set customer plan',
  );
}
