import { Router, type Response } from 'express';
import { config } from '../../config';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import { adminOriginGuard, noStore, requireAdminRole, requireAdminSession, type AdminRequest } from '../admin-auth/middleware';
import { recordAudit } from '../admin-auth/repository';
import {
  createCoupon,
  createPlan,
  listCoupons,
  listFeatures,
  listOrders,
  listPlans,
  replaceFeatures,
  updateCoupon,
  updatePlan,
  type OrderStatus,
} from './repository';
import { parseCouponInput, parseFeatureList, parsePlanInput } from './validation';

// Plans, comparison rows, coupons and payments, mounted at /api/admin/billing.
// Viewing needs read_only; changing the catalogue or coupons needs super_admin.

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_STATUSES: OrderStatus[] = ['created', 'paid', 'provisioned', 'failed', 'review'];
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

router.get('/plans', requireAdminRole('read_only'), handle(async (_req, res) => {
  const [plans, features] = await Promise.all([listPlans({ activeOnly: false }), listFeatures()]);
  res.json({ plans, features });
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

router.get('/coupons', requireAdminRole('read_only'), handle(async (_req, res) => {
  res.json({ coupons: await listCoupons() });
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

router.get('/orders', requireAdminRole('read_only'), handle(async (req, res) => {
  const status = ORDER_STATUSES.includes(req.query.status as OrderStatus) ? req.query.status as OrderStatus : undefined;
  const page = Math.max(1, Math.min(1000, Number.parseInt(String(req.query.page ?? '1'), 10) || 1));
  const { rows, total } = await listOrders({ status, page, pageSize: 25 });
  res.json({ rows, total, page, pageSize: 25 });
}));

export default router;
