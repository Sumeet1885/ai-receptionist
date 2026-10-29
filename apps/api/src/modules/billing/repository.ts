import { supabase } from '../../services/db';
import { workspacePeriodEnd } from '@ai-receptionist/contracts';
import type { CouponRow, Currency, PlanRow } from './pricing';
import type { CouponColumns, FeatureColumns, PlanColumns } from './validation';

// The only place that queries plans, plan_features, coupons and billing_orders (service role).

export type OrderStatus = 'created' | 'paid' | 'provisioned' | 'failed' | 'review';

export interface BillingOrderRow {
  purchase_kind?: 'initial' | 'renewal' | 'plan_change' | 'topup';
  minutes_added?: number | null;
  target_period_start?: string | null;
  target_period_end?: string | null;
  followup_last_status?: 'sending' | 'sent' | 'failed' | null;
  followup_sent_at?: string | null;
  followup_sent_stage?: 'started' | 'closed' | 'failed' | null;
  customer_user_id?: string | null;
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
  lead_notified_at: string | null;
  reminder_due_at: string | null;
  reminder_sent_at: string | null;
  resume_token_hash: string | null;
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
  if (activeOnly) query = query.eq('is_active', true).eq('is_trial', false);
  return (check(await query, 'list plans') ?? []) as PlanRow[];
}

export async function getPlanBySlug(slug: string) {
  return check(await supabase.from('plans').select('*').eq('slug', slug).maybeSingle<PlanRow>(), 'get plan');
}

export async function getTrialPlan(id?: string) {
  let query = supabase.from('plans').select('*').eq('is_active', true).eq('is_trial', true);
  query = id ? query.eq('id', id) : query.eq('slug', 'trial-period');
  return check(await query.maybeSingle<PlanRow>(), 'get trial plan');
}

export async function getProvisioningPlan(id?: string) {
  let query = supabase.from('plans').select('*').eq('is_active', true);
  query = id ? query.eq('id', id) : query.eq('slug', 'trial-period').eq('is_trial', true);
  return check(await query.maybeSingle<PlanRow>(), 'get provisioning plan');
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

export async function insertOrder(row: Omit<BillingOrderRow, 'id' | 'status' | 'failure_reason' | 'checkout_dismissed_at' | 'payment_error' | 'lead_notified_at' | 'reminder_sent_at' | 'resume_token_hash' | 'razorpay_order_id' | 'razorpay_payment_id' | 'paid_at' | 'provisioned_user_id' | 'provisioned_at' | 'created_at' | 'updated_at'> & { ip: string; user_agent: string | null }) {
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

/** Marks an unpaid order's lead alert as sent; null when it already was (or the order is paid). */
export async function claimLeadNotification(id: string) {
  return check(
    await supabase
      .from('billing_orders')
      .update({ lead_notified_at: now() })
      .eq('id', id)
      .eq('status', 'created')
      .is('lead_notified_at', null)
      .select('*')
      .maybeSingle<BillingOrderRow>(),
    'claim lead notification',
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

export type LeadStage = 'started' | 'closed' | 'failed';
export const PAID_STATUSES: OrderStatus[] = ['paid', 'provisioned', 'review'];

/**
 * Orders for the admin tables. `paidOnly` leaves out unpaid checkouts (the revenue page); a lead
 * stage narrows unpaid checkouts (the signup leads page).
 */
export async function listOrders(filters: { status?: OrderStatus; paidOnly?: boolean; initialOnly?: boolean; lead?: LeadStage; purchaseKind?: string; page: number; pageSize: number }) {
  let query = supabase
    .from('billing_orders')
    .select('id,status,currency,total,discount,coupon_code,full_name,email,phone,business_name,plan_snapshot,razorpay_payment_id,paid_at,created_at,failure_reason,checkout_dismissed_at,payment_error,reminder_sent_at,followup_last_status,followup_sent_at,followup_sent_stage,purchase_kind,minutes_added,target_period_end', { count: 'exact' })
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize - 1);
  if (filters.status) query = query.eq('status', filters.status);
  else if (filters.paidOnly) query = query.in('status', PAID_STATUSES);
  if (filters.purchaseKind) query = query.eq('purchase_kind', filters.purchaseKind);
  if (filters.initialOnly) query = query.is('customer_user_id', null);
  if (filters.lead) {
    query = query.eq('status', 'created');
    if (filters.lead === 'failed') query = query.not('payment_error', 'is', null);
    else query = query.is('payment_error', null);
    if (filters.lead === 'closed') query = query.not('checkout_dismissed_at', 'is', null);
    if (filters.lead === 'started') query = query.is('checkout_dismissed_at', null);
  }
  let { data, error, count } = await query;
  if (error && (error.message?.includes('purchase_kind') || error.code === '42703')) {
    let fallbackQuery = supabase
      .from('billing_orders')
      .select('id,status,currency,total,discount,coupon_code,full_name,email,phone,business_name,plan_snapshot,razorpay_payment_id,paid_at,created_at,failure_reason,checkout_dismissed_at,payment_error,reminder_sent_at,followup_last_status,followup_sent_at,followup_sent_stage', { count: 'exact' })
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize - 1);
    if (filters.status) fallbackQuery = fallbackQuery.eq('status', filters.status);
    else if (filters.paidOnly) fallbackQuery = fallbackQuery.in('status', PAID_STATUSES);
    if (filters.initialOnly) fallbackQuery = fallbackQuery.is('customer_user_id', null);
    if (filters.lead) {
      fallbackQuery = fallbackQuery.eq('status', 'created');
      if (filters.lead === 'failed') fallbackQuery = fallbackQuery.not('payment_error', 'is', null);
      else fallbackQuery = fallbackQuery.is('payment_error', null);
      if (filters.lead === 'closed') fallbackQuery = fallbackQuery.not('checkout_dismissed_at', 'is', null);
      if (filters.lead === 'started') fallbackQuery = fallbackQuery.is('checkout_dismissed_at', null);
    }
    const fallbackRes = await fallbackQuery;
    data = fallbackRes.data ? fallbackRes.data.map((r: any) => ({ ...r, purchase_kind: 'initial' })) : [];
    count = fallbackRes.count;
    error = fallbackRes.error;
  }
  if (error) throw new Error(`list orders: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}

/** Complete totals with a bounded summary payload (no raw order downloads). */
export async function getRevenueSummary() {
  const rpcRes = await supabase.rpc('admin_revenue_summary');
  if (rpcRes.error && (rpcRes.error.message?.includes('admin_revenue_summary') || rpcRes.error.code === 'PGRST202' || rpcRes.error.code === '42883')) {
    const { data: paidOrders } = await supabase
      .from('billing_orders')
      .select('total,currency,paid_at,plan_snapshot')
      .in('status', ['paid', 'provisioned', 'review'])
      .not('paid_at', 'is', null);
    const { data: leadOrders } = await supabase
      .from('billing_orders')
      .select('created_at,checkout_dismissed_at,payment_error')
      .eq('status', 'created');
    const { summariseRevenue } = await import('./revenue');
    return summariseRevenue((paidOrders as any) || [], (leadOrders as any) || []);
  }
  return check(rpcRes, 'load revenue summary') as import('./revenue').RevenueSummary;
}

export async function setCustomerPlan(userId: string, order: BillingOrderRow) {
  const started = new Date(order.paid_at || Date.now());
  const periodEnd = workspacePeriodEnd(started, { months: 1 });
  check(
    await supabase
      .from('customer_accounts')
      .update({
        plan_id: order.plan_id,
        plan_currency: order.currency,
        plan_started_at: started.toISOString(),
        current_period_end: periodEnd,
        access_expires_at: periodEnd,
        trial_days: null,
        trial_started_at: null,
        trial_ends_at: null,
        access_months: null,
        access_end_date: null,
        access_starts_at: null,
        billing_order_id: order.id,
        updated_at: now(),
      })
      .eq('user_id', userId),
    'set customer plan',
  );
}

export async function listAdminPlans(filters: { page: number; search?: string; activeOnly?: boolean; trialOnly?: boolean; checkoutOnly?: boolean }) {
  let query = supabase.from('plans').select('*', { count: 'exact' }).order('sort_order').order('created_at').order('id')
    .range((filters.page - 1) * 25, filters.page * 25 - 1);
  if (filters.activeOnly) query = query.eq('is_active', true);
  if (filters.trialOnly) query = query.eq('is_trial', true);
  if (filters.checkoutOnly) query = query.eq('is_trial', false).eq('contact_sales', false);
  const search = (filters.search || '').replace(/[^\p{L}\p{N} .@+_-]/gu, '').slice(0, 100);
  if (search) query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
  const result = await query;
  return { plans: (check(result, 'list admin plans') || []) as PlanRow[], total: result.count || 0, page: filters.page, pageSize: 25 };
}
export async function listAdminCoupons(page: number) {
  const result = await supabase.from('coupons').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false })
    .range((page - 1) * 25, page * 25 - 1);
  const coupons = (check(result, 'list admin coupons') || []) as CouponRow[];
  const ids = [...new Set(coupons.flatMap(coupon => coupon.plan_ids))];
  const names = ids.length ? check(await supabase.from('plans').select('id,name').in('id', ids), 'coupon plan labels') || [] : [];
  return { coupons, planNames: Object.fromEntries(names.map((plan: { id: string; name: string }) => [plan.id, plan.name])), total: result.count || 0, page, pageSize: 25 };
}
