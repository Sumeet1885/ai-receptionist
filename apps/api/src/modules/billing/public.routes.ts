import { validFollowupResume } from './followups';
import bcrypt from 'bcryptjs';
import { Router, type Request, type Response } from 'express';
import { validateCheckoutContact } from '@ai-receptionist/contracts';
import { config } from '../../config';
import { createRateLimit } from '../../middleware/rateLimit';
import { publicFormGuards, publicHeaders } from '../../middleware/publicFormGuards';
import { publishAdminEvent } from '../../services/adminEvents';
import { emailTemplates } from '../../services/email';
import { notifyAdmins } from '../notifications';
import { REMINDER_AFTER_ABANDON_MS, REMINDER_AFTER_CHECKOUT_MS, scheduleReminder } from './reminders';
import { logger } from '../../services/cloudwatchLogger';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import { authEmailExists } from '../access-requests/repository';
import { fulfilPaidOrder } from './fulfil';
import { computeQuote, CURRENCIES, formatMoney, isPurchasable, type Currency, type PlanRow } from './pricing';
import {
  capturePayment,
  createRazorpayOrder,
  fetchPayment,
  razorpayConfigured,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from './razorpay';
import {
  claimLeadNotification,
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
const resumeLimit = createRateLimit({ keyPrefix: 'checkout-resume', limit: 20, windowMs: 15 * 60_000 });
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
      // Reminder if it is never paid; brought forward when the payment window is closed.
      reminder_due_at: new Date(Date.now() + REMINDER_AFTER_CHECKOUT_MS).toISOString(),
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
  if (updated) {
    publishAdminEvent({ type: 'billing_order.updated', id: updated.id, status: reason === 'closed' ? 'abandoned' : 'payment_failed' });
    if (!updated.customer_user_id) {
      void alertLead(updated.id, reason, 'payment_error' in changes ? changes.payment_error : undefined);
      void scheduleReminder(updated.id, new Date(Date.now() + REMINDER_AFTER_ABANDON_MS));
    }
  }
  res.json({ ok: true });
}));

// "Complete my payment" from the reminder email: reopens the saved order (same price and
// Razorpay order) without asking for the details again.
router.post('/checkout/resume', publicHeaders, resumeLimit, asyncRoute('Billing', async (req, res) => {
  const [orderId, token] = String(req.body?.resume ?? '').split('.');
  const invalid = () => res.status(404).json({ error: 'This payment link has expired or was already used. Choose a plan to start again.' });
  if (!orderId || !UUID.test(orderId) || !token) return invalid();

  const order = await getOrder(orderId);
  if (!order || !await validFollowupResume(order, token)) return invalid();
  if (order.status !== 'created') {
    if (['paid', 'provisioned', 'review'].includes(order.status)) {
      return res.status(409).json({ error: 'Payment has already been received for this order. Do not pay again. Sign in if your workspace is activated, or use the confirmation email to finish setup.', paid: true, code: 'order_paid' });
    }
    return res.status(409).json({ error: 'This checkout is no longer available. Choose a plan to start a new checkout.', code: 'order_unavailable' });
  }
  if (order.customer_user_id) return res.status(409).json({ error: 'Sign in to your existing workspace to complete this payment.' });
  if (!order.razorpay_order_id || !order.password_hash) {
    let selected = await getPlanBySlug(order.plan_snapshot.slug);
    if (!selected || !isPurchasable(selected, order.currency)) {
      selected = (await listPlans({ activeOnly: true })).find(plan => isPurchasable(plan, order.currency)) || null;
    }
    if (!selected) return res.status(409).json({ error: 'No online plans are available right now. Please contact support.' });
    return res.json({ order: null, requiresDetails: true, plan: publicPlan(selected), quote: computeQuote(selected, order.currency, null),
      contact: { fullName: order.full_name, email: order.email, phone: order.phone, businessName: order.business_name }, businessName: order.business_name });
  }
  if (!razorpayConfigured()) return res.status(503).json({ error: 'Online payments are temporarily unavailable. Please try again shortly.' });

  res.json({
    order: {
      orderId: order.id,
      razorpayOrderId: order.razorpay_order_id,
      keyId: config.razorpay.keyId,
      amount: order.total,
      currency: order.currency,
      description: `${order.plan_snapshot.name}: first month and setup`,
      prefill: { name: order.full_name, email: order.email, contact: order.phone },
    },
    plan: publicPlan(order.plan_snapshot),
    quote: {
      currency: order.currency,
      planAmount: order.plan_amount,
      setupFee: order.setup_fee,
      discount: order.discount,
      total: order.total,
      coupon: order.coupon_code ? { code: order.coupon_code, description: null } : null,
    },
    businessName: order.business_name,
    requiresDetails: false,
  });
}));

// One email per checkout, the first time it is closed or fails, to whoever gets signup-lead alerts.
async function alertLead(orderId: string, outcome: 'closed' | 'failed', reason?: string) {
  const lead = await claimLeadNotification(orderId).catch(() => null);
  if (!lead) return;
  await notifyAdmins('signup_leads', emailTemplates.adminSignupLead({
    name: lead.full_name,
    email: lead.email,
    phone: lead.phone,
    businessName: lead.business_name,
    planName: lead.plan_snapshot.name,
    amount: formatMoney(lead.total, lead.currency),
    outcome,
    reason,
    consoleUrl: `${config.admin.origin}${config.admin.basePath}signup-leads`,
  }), 'admin_signup_lead');
}

/**
 * POST /api/public/razorpay/webhook, mounted before express.json with a raw body (the signature
 * covers the exact bytes). Backup path when the browser never reports back after paying.
 */
export const razorpayWebhook = asyncRoute('BillingWebhook', async (req, res) => {
  const signature = req.get('x-razorpay-signature') ?? '';
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!verifyWebhookSignature(raw, signature)) return res.status(400).json({ error: 'Invalid signature' });

  let event: any;
  try { event = JSON.parse(raw.toString('utf8')); }
  catch { return res.status(400).json({ error: 'Invalid webhook payload' }); }
  const payment = event?.payload?.payment?.entity;
  if (!['payment.captured', 'order.paid'].includes(event?.event) || !payment?.order_id) return res.json({ ok: true });
  if (payment.status !== 'captured' || typeof payment.id !== 'string' || !payment.id
    || typeof payment.order_id !== 'string' || !Number.isSafeInteger(payment.amount) || payment.amount <= 0) {
    return res.status(400).json({ error: 'Invalid captured payment payload' });
  }

  const order = await getOrderByRazorpayOrderId(payment.order_id);
  if (!order) return res.json({ ok: true });
  if (payment.amount !== order.total || payment.currency !== order.currency) {
    logger.error('[billing] webhook payment does not match order', { order: order.id });
    return res.json({ ok: true });
  }
  const done = await fulfilPaidOrder(order, payment.id);
  if (done.status === 'paid') {
    // Another worker may still own provisioning, or a crashed worker's lease
    // has not expired. Never acknowledge unfinished fulfilment as delivered.
    res.setHeader('Retry-After', '120');
    return res.status(503).json({ error: 'Payment fulfilment is still processing. Retry delivery.' });
  }
  res.json({ ok: true });
});

export default router;
