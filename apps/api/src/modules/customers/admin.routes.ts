import { Router, type Response } from 'express';
import { LIMITS } from '@ai-receptionist/contracts';
import { config } from '../../config';
import { emailTemplates, sendEmail } from '../../services/email';
import { supabase } from '../../services/db';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import { createActivationLink, createVerificationLink } from '../accounts/links';
import { adminOriginGuard, noStore, requireAdminRole, requireAdminSession, type AdminRequest } from '../admin-auth/middleware';
import { recordAudit } from '../admin-auth/repository';
import { listCustomers, setCustomerStatus, type CustomerRow } from './repository';

// Customer workspaces, mounted at /api/admin/customers. Viewing needs read_only; resending an
// email needs support; suspending or reactivating needs super_admin. Every change is audited.

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 25;
const STAGES = ['verify_email', 'set_password', 'onboarding', 'active', 'suspended'] as const;
type StageFilter = (typeof STAGES)[number];
const handle = (fn: (req: AdminRequest, res: Response) => Promise<unknown>) => asyncRoute<AdminRequest>('CustomersAdmin', fn);

router.use(noStore);
router.use(adminOriginGuard(config.admin.origins));
router.use(requireAdminSession);

function audit(req: AdminRequest, action: string, userId: string, metadata: Record<string, unknown>) {
  return recordAudit({
    action,
    decision: 'allowed',
    outcome: 'succeeded',
    actor_admin_user_id: req.admin!.adminUser.id,
    actor_session_id: req.admin!.sessionId,
    resource_type: 'customer',
    resource_id: userId,
    ip: getClientIp(req),
    metadata,
  });
}

const matches = (row: CustomerRow, search: string) =>
  [row.email, row.name, row.businessName].some((value) => value?.toLowerCase().includes(search));

router.get('/', requireAdminRole('read_only'), handle(async (req, res) => {
  const stage = STAGES.includes(req.query.stage as StageFilter) ? req.query.stage as StageFilter : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase().slice(0, LIMITS.search.max) : '';
  const page = Math.max(1, Math.min(1000, Number.parseInt(String(req.query.page ?? '1'), 10) || 1));

  const all = await listCustomers();
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<StageFilter, number>;
  for (const row of all) counts[row.stage as StageFilter] += 1;

  const filtered = all.filter((row) => (!stage || row.stage === stage) && (!search || matches(row, search)));
  res.json({
    rows: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: filtered.length,
    page,
    pageSize: PAGE_SIZE,
    counts: { all: all.length, ...counts },
  });
}));

router.post('/:id/status', requireAdminRole('super_admin'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const status = req.body?.status;
  if (status !== 'active' && status !== 'suspended') return res.status(400).json({ error: 'Status must be active or suspended.' });
  if (!(await setCustomerStatus(req.params.id, status))) return res.status(404).json({ error: 'Customer not found' });
  await audit(req, status === 'suspended' ? 'customer.suspend' : 'customer.reactivate', req.params.id, {});
  res.json({ ok: true, status });
}));

// Sends whichever email gets the customer moving again: activation (confirm email and set a
// password) for approved requests, email confirmation for paid signups.
router.post('/:id/resend', requireAdminRole('support'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const row = (await listCustomers()).find((customer) => customer.userId === req.params.id);
  if (!row) return res.status(404).json({ error: 'Customer not found' });
  if (row.status === 'suspended') return res.status(409).json({ error: 'Reactivate this customer first.' });
  if (row.stage !== 'verify_email' && row.stage !== 'set_password') {
    return res.status(409).json({ error: 'This customer has already activated their workspace.' });
  }

  const { data: account } = await supabase.from('customer_accounts').select('password_set_at').eq('user_id', row.userId).maybeSingle();
  const hours = config.email.linkExpiryHours;
  if (account?.password_set_at) {
    const link = await createVerificationLink(row.email);
    await sendEmail(row.email, emailTemplates.emailVerification({ verificationUrl: link.url, expiresInHours: hours }), 'email_verification');
  } else {
    const link = await createActivationLink({ email: row.email, userId: row.userId, fullName: row.name ?? '', businessName: row.businessName ?? '' });
    await sendEmail(row.email, emailTemplates.workspaceActivation({ name: row.name ?? 'there', activationUrl: link.url, expiresInHours: hours }), 'workspace_activation');
  }
  await audit(req, 'customer.resend_activation', row.userId, { stage: row.stage });
  res.json({ ok: true });
}));

export default router;
