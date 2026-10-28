import { Router } from 'express';
import { config } from '../../config';
import { requireAuth, type AuthRequest } from '../../middleware/auth';
import { createRateLimit } from '../../middleware/rateLimit';
import { noStore } from '../admin-auth/middleware';
import { getCustomerAccount } from '../accounts/repository';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import { computeQuote, isPurchasable, type Currency } from './pricing';
import { getPlanBySlug, insertOrder, updateOrder } from './repository';
import { createRazorpayOrder, razorpayConfigured } from './razorpay';

export const customerBillingRoutes = Router();
customerBillingRoutes.use(noStore, requireAuth);
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
    if (
      !account.access_expires_at ||
      Date.parse(account.access_expires_at) > Date.now()
    )
      return res
        .status(409)
        .json({ error: 'Your workspace plan is already active.' });
    if (!razorpayConfigured())
      return res
        .status(503)
        .json({ error: 'Online payments are temporarily unavailable.' });
    const currency = req.body?.currency as Currency;
    if (
      !['INR', 'USD'].includes(currency) ||
      typeof req.body?.plan !== 'string'
    )
      return res.status(400).json({ error: 'Choose a plan and currency.' });
    const plan = await getPlanBySlug(req.body.plan);
    if (!plan || !isPurchasable(plan, currency))
      return res.status(404).json({ error: 'Choose an available paid plan.' });
    const quote = computeQuote(plan, currency, null);
    const order = await insertOrder({
      customer_user_id: req.user!.id,
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
        description: `${plan.name}: first month and setup`,
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
