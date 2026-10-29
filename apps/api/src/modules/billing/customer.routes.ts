import { Router } from 'express';
import { config } from '../../config';
import { requireAuth, type AuthRequest } from '../../middleware/auth';
import { createRateLimit } from '../../middleware/rateLimit';
import { noStore } from '../admin-auth/middleware';
import { getCustomerAccount } from '../accounts/repository';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import { isPurchasable, MINIMUM_CHARGE, planPrice, type Currency } from './pricing';
import { getPlanBySlug, insertOrder, updateOrder } from './repository';
import { createRazorpayOrder, razorpayConfigured } from './razorpay';
import { getMinuteSummary, topupOffer } from './minutes';
import { supabase } from '../../services/db';

export const customerBillingRoutes = Router();
customerBillingRoutes.use(noStore, requireAuth);
customerBillingRoutes.get('/summary', asyncRoute<AuthRequest>('WorkspaceBilling', async (req, res) => {
  const summary = await getMinuteSummary(req.user!.id);
  if (!summary) return res.status(404).json({ error: 'Workspace not found.' });
  const { features, ...safe } = summary;
  const eligible = summary.active && !summary.isTrial && summary.includedMinutes !== null;
  const topupOffers = { INR: eligible ? topupOffer(features, 'INR') : null, USD: eligible ? topupOffer(features, 'USD') : null };
  res.json({ ...safe, topupOffers, topupOffer: topupOffers[summary.currency] });
}));
customerBillingRoutes.get('/history', asyncRoute<AuthRequest>('WorkspaceBilling', async (req, res) => {
  const page = Math.max(1, Math.min(100000, Number.parseInt(String(req.query.page || '1'), 10) || 1));
  const { data, error, count } = await supabase.from('billing_orders')
    .select('id,purchase_kind,minutes_added,plan_snapshot,currency,total,status,created_at,paid_at,razorpay_payment_id,target_period_end,payment_error', { count: 'exact' })
    .or(`customer_user_id.eq.${req.user!.id},provisioned_user_id.eq.${req.user!.id}`)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * 10, page * 10 - 1);
  if (error) throw new Error(`Load purchase history: ${error.message}`);
  res.json({ rows: (data || []).map(({ plan_snapshot, ...row }) => ({ ...row, planName: plan_snapshot?.name || 'Plan' })), total: count || 0, page, pageSize: 10 });
}));
customerBillingRoutes.post(
  '/order',
  createRateLimit(
    { keyPrefix: 'workspace-order', limit: 10, windowMs: 60 * 60_000 },
    (req) => (req as AuthRequest).user!.id,
  ),
  asyncRoute<AuthRequest>('WorkspaceBilling', async (req, res) => {
    const account = await getCustomerAccount(req.user!.id);
    if (
      !account ||
      account.status !== 'active' ||
      !req.user!.emailConfirmedAt ||
      !account.password_set_at
    )
      return res
        .status(403)
        .json({ error: 'Verify your account before buying a plan.' });
    if (!razorpayConfigured())
      return res
        .status(503)
        .json({ error: 'Online payments are temporarily unavailable.' });
    const isTopup = req.body?.kind === 'topup';
    if (req.body?.kind !== undefined && !['topup', 'plan_change', 'renewal'].includes(req.body.kind)) return res.status(400).json({ error: 'Choose a purchase type.' });
    const summary = await getMinuteSummary(req.user!.id);
    if (!summary) return res.status(404).json({ error: 'Workspace not found.' });
    if (summary.startsAt && Date.parse(summary.startsAt) > Date.now()) return res.status(409).json({ error: 'Wait for your scheduled plan to start before changing it.' });
    const currency = (req.body?.currency ?? (isTopup ? summary.currency : undefined)) as Currency;
    if (
      !['INR', 'USD'].includes(currency) ||
      (!isTopup && typeof req.body?.plan !== 'string')
    )
      return res.status(400).json({ error: 'Choose a plan and currency.' });
    const plan = await getPlanBySlug(isTopup ? summary.planSlug! : req.body.plan);
    if (!plan || (isTopup ? !plan.is_active || plan.is_trial || plan.contact_sales : !isPurchasable(plan, currency)))
      return res.status(404).json({ error: 'Choose an available paid plan.' });
    const offer = topupOffer(plan.feature_values, currency);
    const quantity = req.body?.quantity ?? 1;
    if (isTopup && (!summary.active || summary.isTrial || summary.includedMinutes === null || !offer)) return res.status(409).json({ error: 'Extra minutes are not available for this plan. Choose another plan or contact support.' });
    if (isTopup && (!Number.isInteger(quantity) || quantity < 1 || quantity > 10)) return res.status(400).json({ error: 'Choose between 1 and 10 minute packs.' });
    const purchaseKind = isTopup ? 'topup' : summary.active ? 'plan_change' : 'renewal';
    const amount = isTopup ? offer!.amount * quantity : planPrice(plan, currency).planAmount;
    if (!Number.isSafeInteger(amount) || amount < MINIMUM_CHARGE[currency]) return res.status(400).json({ error: 'Online payment is not configured for this price. Please contact support.' });
    const quote = { planAmount: amount, setupFee: 0, discount: 0, total: amount };
    const order = await insertOrder({
      customer_user_id: req.user!.id,
      purchase_kind: purchaseKind,
      minutes_added: isTopup ? offer!.minutes * quantity : null,
      target_period_start: summary.startsAt,
      target_period_end: isTopup ? summary.expiresAt : null,
      plan_id: plan.id,
      plan_snapshot: plan,
      currency,
      plan_amount: quote.planAmount,
      setup_fee: quote.setupFee,
      discount: quote.discount,
      total: quote.total,
      coupon_id: null,
      coupon_code: null,
      full_name: req.user!.name || req.user!.email!,
      email: req.user!.email!,
      phone: '',
      business_name: req.user!.name || 'Workspace',
      password_hash: null,
      reminder_due_at: null,
      ip: getClientIp(req),
      user_agent: req.get('user-agent')?.slice(0, 500) || null,
    });
    try {
      const paymentOrder = await createRazorpayOrder({
        amount: quote.total,
        currency,
        receipt: order.id,
        notes: { billing_order_id: order.id, plan: plan.slug },
      });
      if (
        paymentOrder.amount !== quote.total ||
        paymentOrder.currency !== currency
      )
        throw new Error('Payment order mismatch');
      await updateOrder(order.id, { razorpay_order_id: paymentOrder.id });
      res.json({
        orderId: order.id,
        razorpayOrderId: paymentOrder.id,
        keyId: config.razorpay.keyId,
        amount: quote.total,
        currency,
        description: isTopup ? `${offer!.minutes * quantity} extra calling minutes` : `${plan.name}: one month (no setup fee)`,
        prefill: { name: order.full_name, email: order.email, contact: '' },
      });
    } catch {
      await updateOrder(order.id, {
        status: 'failed',
        failure_reason: 'Could not start workspace payment',
      });
      res
        .status(502)
        .json({ error: 'Could not start payment. Please try again.' });
    }
  }),
);
