import bcrypt from 'bcryptjs';
import { Router, type Request, type Response } from 'express';
import { validateCheckoutContact } from '@ai-receptionist/contracts';
import { config } from '../../config';
import { createRateLimit } from '../../middleware/rateLimit';
import { publicFormGuards, publicHeaders } from '../../middleware/publicFormGuards';
import { publishAdminEvent } from '../../services/adminEvents';
import { logger } from '../../services/cloudwatchLogger';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import { authEmailExists } from '../access-requests/repository';
import { fulfilPaidOrder } from './fulfil';
import { computeQuote, CURRENCIES, isPurchasable, type Currency, type PlanRow } from './pricing';
import {
  capturePayment,
  createRazorpayOrder,
  fetchPayment,
  razorpayConfigured,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from './razorpay';
import {
  getCouponByCode,
  getOrder,
  getOrderByRazorpayOrderId,
  getPlanBySlug,
  insertOrder,
  listFeatures,
  listPlans,
  transitionOrder,
  updateOrder,
} from './repository';

// Public pricing and checkout, mounted at /api/public. Prices are always computed here.

const router = Router();
const quoteLimit = createRateLimit({ keyPrefix: 'checkout-quote', limit: 30, windowMs: 60_000 });
const verifyLimit = createRateLimit({ keyPrefix: 'checkout-verify', limit: 20, windowMs: 60_000 });
const abandonLimit = createRateLimit({ keyPrefix: 'checkout-abandon', limit: 20, windowMs: 60_000 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function publicPlan(plan: PlanRow) {
  return {
    slug: plan.slug,
    name: plan.name,
    tagline: plan.tagline,
    featured: plan.is_featured,
    contactSales: plan.contact_sales,
    monthlyMinutes: plan.monthly_minutes,
    price: { INR: plan.price_inr, USD: plan.price_usd },
    setupFee: { INR: plan.setup_fee_inr, USD: plan.setup_fee_usd },
    maxAgents: plan.max_agents,
    maxConcurrentCalls: plan.max_concurrent_calls,
    features: plan.feature_values,
  };
}

function currencyFrom(value: unknown): Currency | null {
  return CURRENCIES.includes(value as Currency) ? value as Currency : null;
}

// Loads the plan and coupon for a quote; responds with a 4xx itself and returns null on problems.
async function quoteFor(req: Request, res: Response) {
  const currency = currencyFrom(req.body?.currency);
  const slug = typeof req.body?.plan === 'string' ? req.body.plan : '';
  const couponCode = typeof req.body?.couponCode === 'string' ? req.body.couponCode.trim() : '';
  if (!currency || !slug) {
    res.status(400).json({ error: 'Choose a plan and currency.' });
    return null;
  }
  const plan = await getPlanBySlug(slug);
  if (!plan || !isPurchasable(plan, currency)) {
    res.status(404).json({ error: 'This plan is not available for online purchase.' });
    return null;
  }
  const coupon = couponCode ? await getCouponByCode(couponCode) : null;
  if (couponCode && !coupon) {
    res.status(400).json({ error: 'This coupon code is not valid.', field: 'couponCode' });
    return null;
  }
  try {
    return { plan, quote: computeQuote(plan, currency, coupon) };
  } catch (error: any) {
    res.status(400).json({ error: error.message, field: coupon ? 'couponCode' : undefined });
    return null;
  }
}

router.get('/plans', publicHeaders, asyncRoute('Billing', async (_req, res) => {
  const [plans, features] = await Promise.all([listPlans({ activeOnly: true }), listFeatures()]);
  res.json({ plans: plans.map(publicPlan), features: features.map(({ key, label }) => ({ key, label })) });
}));

router.post('/checkout/quote', publicHeaders, quoteLimit, asyncRoute('Billing', async (req, res) => {
  const result = await quoteFor(req, res);
  if (result) res.json({ plan: publicPlan(result.plan), quote: result.quote });
}));

router.post(
  '/checkout/order',
  ...publicFormGuards('checkout', { floodPer10Min: 20, perIpPerHour: 10, perEmailPerHour: 5 }),
  asyncRoute('Billing', async (req, res) => {
    if (!razorpayConfigured()) return res.status(503).json({ error: 'Online payments are not available right now. Please contact us.' });

    const contact = validateCheckoutContact(req.body);
    if ('errors' in contact) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: contact.errors });

    const result = await quoteFor(req, res);
    if (!result) return;
    const { plan, quote } = result;

    // Paid checkout creates a new workspace; existing customers upgrade from inside the app.
    if (await authEmailExists(contact.value.email)) {
      return res.status(409).json({ error: 'This email already has a workspace. Sign in, or use a different email.', field: 'email' });
    }

    const order = await insertOrder({
      plan_id: plan.id,
      plan_snapshot: plan,
      currency: quote.currency,
      plan_amount: quote.planAmount,
      setup_fee: quote.setupFee,
      discount: quote.discount,
      total: quote.total,
      coupon_id: quote.coupon?.id ?? null,
      coupon_code: quote.coupon?.code ?? null,
      full_name: contact.value.fullName,
      email: contact.value.email,
      phone: contact.value.phone,
      business_name: contact.value.businessName,
      // Becomes the login only once the payment is captured (see fulfil.ts).
      password_hash: await bcrypt.hash(contact.value.password, 10),
      ip: getClientIp(req),
      user_agent: req.get('user-agent')?.slice(0, 500) ?? null,
    });

    try {
      const razorpayOrder = await createRazorpayOrder({
        amount: quote.total,
        currency: quote.currency,
        receipt: order.id,
        notes: { billing_order_id: order.id, plan: plan.slug },
      });
      if (razorpayOrder.amount !== quote.total || razorpayOrder.currency !== quote.currency) throw new Error('Razorpay order amount mismatch');
      await updateOrder(order.id, { razorpay_order_id: razorpayOrder.id });

      res.json({
        orderId: order.id,
        razorpayOrderId: razorpayOrder.id,
        keyId: config.razorpay.keyId,
        amount: quote.total,
        currency: quote.currency,
        description: `${plan.name}: first month and setup`,
        prefill: { name: contact.value.fullName, email: contact.value.email, contact: contact.value.phone },
      });
    } catch (error: any) {
      logger.error('[billing] could not create Razorpay order', { order: order.id, error: error?.message });
      await updateOrder(order.id, { status: 'failed', failure_reason: 'Could not start the payment' });
      res.status(502).json({ error: 'We could not start the payment. Please try again in a minute.' });
    }
  }),
);

router.post('/checkout/verify', publicHeaders, verifyLimit, asyncRoute('Billing', async (req, res) => {
  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body ?? {};
  if (![orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature].every((v) => typeof v === 'string' && v.length < 200) || !UUID.test(orderId)) {
    return res.status(400).json({ error: 'Invalid payment confirmation.' });
  }

  const order = await getOrder(orderId);
  if (!order || order.razorpay_order_id !== razorpayOrderId) return res.status(404).json({ error: 'Order not found.' });
  if (!verifyCheckoutSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    return res.status(400).json({ error: 'Payment could not be verified.' });
  }
  if (order.status === 'provisioned' || order.status === 'review') return res.json({ status: order.status });

  // The signature proves Razorpay issued this payment for our order; also confirm it is captured
  // for the exact amount before creating anything.
  let payment = await fetchPayment(razorpayPaymentId);
  if (payment.order_id !== razorpayOrderId || payment.amount !== order.total || payment.currency !== order.currency) {
    logger.error('[billing] payment does not match order', { order: order.id, payment: razorpayPaymentId });
    return res.status(400).json({ error: 'Payment could not be verified.' });
  }
  if (payment.status === 'authorized') payment = await capturePayment(payment.id, order.total, order.currency);
  if (payment.status !== 'captured') return res.status(202).json({ status: 'pending' });

  const done = await fulfilPaidOrder(order, payment.id);
  res.json({ status: done.status });
}));

// The person closed the confirmation or the Razorpay window, or Razorpay reported a failed attempt.
// Kept on the order so the team can follow up; an order that is paid later still goes through.
router.post('/checkout/abandoned', publicHeaders, abandonLimit, asyncRoute('Billing', async (req, res) => {
  const { orderId, razorpayOrderId, reason, message } = req.body ?? {};
  if (typeof orderId !== 'string' || !UUID.test(orderId) || typeof razorpayOrderId !== 'string' || !['closed', 'failed'].includes(reason)) {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  const order = await getOrder(orderId);
  if (!order || order.razorpay_order_id !== razorpayOrderId) return res.status(404).json({ error: 'Order not found.' });

  const changes = reason === 'closed'
    ? { checkout_dismissed_at: new Date().toISOString() }
    : { payment_error: typeof message === 'string' && message.trim() ? message.trim().slice(0, 300) : 'Payment failed' };
  const updated = await transitionOrder(order.id, ['created'], changes);
  if (updated) publishAdminEvent({ type: 'billing_order.updated', id: updated.id, status: reason === 'closed' ? 'abandoned' : 'payment_failed' });
  res.json({ ok: true });
}));

/**
 * POST /api/public/razorpay/webhook, mounted before express.json with a raw body (the signature
 * covers the exact bytes). Backup path when the browser never reports back after paying.
 */
export const razorpayWebhook = asyncRoute('BillingWebhook', async (req, res) => {
  const signature = req.get('x-razorpay-signature') ?? '';
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!verifyWebhookSignature(raw, signature)) return res.status(400).json({ error: 'Invalid signature' });

  const event = JSON.parse(raw.toString('utf8'));
  const payment = event?.payload?.payment?.entity;
  if (!['payment.captured', 'order.paid'].includes(event?.event) || !payment?.order_id) return res.json({ ok: true });

  const order = await getOrderByRazorpayOrderId(payment.order_id);
  if (!order) return res.json({ ok: true });
  if (payment.amount !== order.total || payment.currency !== order.currency) {
    logger.error('[billing] webhook payment does not match order', { order: order.id });
    return res.json({ ok: true });
  }
  await fulfilPaidOrder(order, payment.id);
  res.json({ ok: true });
});

export default router;
