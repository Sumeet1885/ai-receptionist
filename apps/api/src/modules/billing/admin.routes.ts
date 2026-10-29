import { Router, type Response } from 'express';
import { config } from '../../config';
import { createRateLimit } from '../../middleware/rateLimit';
import { followupContent, FollowupError, sendCheckoutFollowup } from './followups';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import { adminOriginGuard, noStore, requireAdminRole, requireAdminSession, type AdminRequest } from '../admin-auth/middleware';
import { recordAudit } from '../admin-auth/repository';
import {
  getOrder,
  createCoupon,
  createPlan,
  listAdminCoupons,
  listFeatures,
  listOrders,
  getRevenueSummary,
  listAdminPlans,
  replaceFeatures,
  updateCoupon,
  updatePlan,
  type LeadStage,
  type OrderStatus,
} from './repository';
import { parseCouponInput, parseFeatureList, parsePlanInput } from './validation';

// Plans, comparison rows, coupons and payments, mounted at /api/admin/billing.
// Viewing needs read_only; changing the catalogue or coupons needs super_admin.

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_STATUSES: OrderStatus[] = ['created', 'paid', 'provisioned', 'failed', 'review'];
const LEAD_STAGES: LeadStage[] = ['started', 'closed', 'failed'];
const handle = (fn: (req: AdminRequest, res: Response) => Promise<unknown>) => asyncRoute<AdminRequest>('BillingAdmin', fn);

router.use(noStore);
router.use(adminOriginGuard(config.admin.origins));
router.use(requireAdminSession);

function audit(req: AdminRequest, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  return recordAudit({
    action,
    decision: 'allowed',
    outcome: 'succeeded',
    actor_admin_user_id: req.admin!.adminUser.id,
    actor_session_id: req.admin!.sessionId,
    resource_type: resourceType,
    resource_id: resourceId,
    ip: getClientIp(req),
    metadata,
  });
}

// ── plans ────────────────────────────────────────────────────────────────────

router.get('/plans', requireAdminRole('read_only'), handle(async (req, res) => {
  const page = Math.max(1, Math.min(1000, Number.parseInt(String(req.query.page || '1'), 10) || 1));
  const [result, features] = await Promise.all([listAdminPlans({ page, search: typeof req.query.search === 'string' ? req.query.search : '', activeOnly: req.query.activeOnly === 'true', trialOnly: req.query.trialOnly === 'true', checkoutOnly: req.query.checkoutOnly === 'true' }), listFeatures()]);
  res.json({ ...result, features });
}));

router.post('/plans', requireAdminRole('super_admin'), handle(async (req, res) => {
  const parsed = parsePlanInput(req.body);
  if ('errors' in parsed) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: parsed.errors });
  const plan = await createPlan(parsed.value);
  if (!plan) return res.status(409).json({ error: 'A plan with this slug already exists.', fields: { slug: 'Already used.' } });
  await audit(req, 'plan.create', 'plan', plan.id, { slug: plan.slug });
  res.status(201).json({ plan });
}));

router.put('/plans/:id', requireAdminRole('super_admin'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Plan not found' });
  const parsed = parsePlanInput(req.body);
  if ('errors' in parsed) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: parsed.errors });
  try {
    const plan = await updatePlan(req.params.id, parsed.value);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    await audit(req, 'plan.update', 'plan', plan.id, { slug: plan.slug, active: plan.is_active });
    res.json({ plan });
  } catch (error: any) {
    if (error.code === '23505') return res.status(409).json({ error: 'A plan with this slug already exists.', fields: { slug: 'Already used.' } });
    throw error;
  }
}));

router.put('/features', requireAdminRole('super_admin'), handle(async (req, res) => {
  const parsed = parseFeatureList(req.body?.features);
  if ('errors' in parsed) return res.status(400).json({ error: 'Please check the comparison rows.', fields: parsed.errors });
  const features = await replaceFeatures(parsed.value);
  await audit(req, 'plan_features.update', 'plan_features', 'all', { count: features.length });
  res.json({ features });
}));

// ── coupons ──────────────────────────────────────────────────────────────────

router.get('/coupons', requireAdminRole('read_only'), handle(async (req, res) => {
  const page = Math.max(1, Math.min(1000, Number.parseInt(String(req.query.page || '1'), 10) || 1));
  res.json(await listAdminCoupons(page));
}));

router.post('/coupons', requireAdminRole('super_admin'), handle(async (req, res) => {
  const parsed = parseCouponInput(req.body);
  if ('errors' in parsed) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: parsed.errors });
  const coupon = await createCoupon(parsed.value, req.admin!.adminUser.id);
  if (!coupon) return res.status(409).json({ error: 'This code already exists.', fields: { code: 'Already used.' } });
  await audit(req, 'coupon.create', 'coupon', coupon.id, { code: coupon.code });
  res.status(201).json({ coupon });
}));

router.put('/coupons/:id', requireAdminRole('super_admin'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Coupon not found' });
  const parsed = parseCouponInput(req.body);
  if ('errors' in parsed) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: parsed.errors });
  try {
    const coupon = await updateCoupon(req.params.id, parsed.value);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    await audit(req, 'coupon.update', 'coupon', coupon.id, { code: coupon.code, active: coupon.is_active });
    res.json({ coupon });
  } catch (error: any) {
    if (error.code === '23505') return res.status(409).json({ error: 'This code already exists.', fields: { code: 'Already used.' } });
    throw error;
  }
}));

// ── payments ─────────────────────────────────────────────────────────────────

// `view=revenue` lists paid orders; `view=leads` unpaid checkouts, optionally by `stage`.
router.get('/orders', requireAdminRole('read_only'), handle(async (req, res) => {
  const status = ORDER_STATUSES.includes(req.query.status as OrderStatus) ? req.query.status as OrderStatus : undefined;
  const page = Math.max(1, Math.min(1000, Number.parseInt(String(req.query.page ?? '1'), 10) || 1));
  const view = req.query.view;
  const stage = LEAD_STAGES.includes(req.query.stage as LeadStage) ? req.query.stage as LeadStage : undefined;
  const purchaseKind = ['initial', 'renewal', 'plan_change', 'topup'].includes(String(req.query.kind)) ? String(req.query.kind) : undefined;
  const { rows, total } = view === 'leads'
    ? await listOrders({ lead: stage, initialOnly: true, page, pageSize: 25, status: stage ? undefined : 'created' })
    : await listOrders({ status, paidOnly: view === 'revenue', purchaseKind, page, pageSize: 25 });
  res.json({ rows, total, page, pageSize: 25 });
}));

router.get('/orders/:id/email-preview', requireAdminRole('support'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Lead not found' });
  const order = await getOrder(req.params.id);
  if (!order || order.status !== 'created') return res.status(409).json({ error: 'Only unpaid checkout leads can receive this email.' });
  const content = followupContent(order);
  res.json({ ...content, to: order.email, lastSentAt: order.followup_sent_at || order.reminder_sent_at });
}));

router.post('/orders/:id/send-email', requireAdminRole('support'), createRateLimit({ keyPrefix: 'admin-lead-email', limit: 30, windowMs: 60 * 60_000 }, req => (req as AdminRequest).admin!.adminUser.id), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Lead not found' });
  if (!LEAD_STAGES.includes(req.body?.stage)) return res.status(400).json({ error: 'Open the email preview before sending.' });
  try {
    const result = await sendCheckoutFollowup(req.params.id, req.admin!.adminUser.id, req.body.stage);
    await audit(req, 'lead_email.send', 'billing_order', req.params.id, { stage: result.stage, messageId: result.messageId });
    res.json(result);
  } catch (error) {
    if (!(error instanceof FollowupError)) throw error;
    await audit(req, 'lead_email.send_failed', 'billing_order', req.params.id, { reason: error.message });
    res.status(error.status).json({ error: error.message });
  }
}));

router.get('/revenue', requireAdminRole('read_only'), handle(async (_req, res) => {
  res.json(await getRevenueSummary());
}));

export default router;
