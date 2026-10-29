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
import { getCustomer, listCustomers, setCustomerStatus } from './repository';

// Customer workspaces, mounted at /api/admin/customers. Viewing needs read_only; resending an
// email needs support; suspending or reactivating needs super_admin. Every change is audited.

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 25;
const STAGES = ['verify_email', 'set_password', 'onboarding', 'active', 'suspended', 'payment_required', 'scheduled'] as const;
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

router.get('/', requireAdminRole('read_only'), handle(async (req, res) => {
  const stage = STAGES.includes(req.query.stage as StageFilter) ? req.query.stage as StageFilter : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase().slice(0, LIMITS.search.max) : '';
  const page = Math.max(1, Math.min(1000, Number.parseInt(String(req.query.page ?? '1'), 10) || 1));

  const result = await listCustomers({ page, pageSize: PAGE_SIZE, stage, search });
  res.json({ ...result, page, pageSize: PAGE_SIZE });
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
  const row = await getCustomer(req.params.id);
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

// Lists bots assigned to this customer as well as available bots across the workspace
router.get('/:id/agents', requireAdminRole('read_only'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });

  const { data: assigned, error: assignedErr } = await supabase
    .from('bots')
    .select('id, business_name, industry, dograh_phone_number, dograh_workflow_id, dograh_outbound_workflow_id, is_active, created_at, owner_id')
    .eq('owner_id', req.params.id)
    .order('created_at', { ascending: false });

  if (assignedErr) return res.status(500).json({ error: assignedErr.message });

  const { data: allBots, error: allErr } = await supabase
    .from('bots')
    .select('id, business_name, industry, dograh_phone_number, dograh_workflow_id, dograh_outbound_workflow_id, is_active, created_at, owner_id')
    .order('created_at', { ascending: false });

  if (allErr) return res.status(500).json({ error: allErr.message });

  res.json({
    assigned: assigned || [],
    all: allBots || [],
  });
}));

// Assigns an existing bot persona to a customer
router.post('/:id/assign-agent', requireAdminRole('support'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const botId = req.body?.botId;
  if (!botId || !UUID.test(botId)) return res.status(400).json({ error: 'Valid botId is required' });

  const { data: bot, error: botErr } = await supabase
    .from('bots')
    .select('id, business_name, owner_id')
    .eq('id', botId)
    .maybeSingle();

  if (botErr || !bot) return res.status(404).json({ error: 'Agent not found' });

  const { error: updateErr } = await supabase
    .from('bots')
    .update({ owner_id: req.params.id })
    .eq('id', botId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await audit(req, 'customer.assign_agent', req.params.id, {
    botId,
    previousOwnerId: bot.owner_id,
    botName: bot.business_name,
  });

  res.json({ ok: true, botId });
}));

// Creates and provisions a new bot persona directly assigned to the customer
router.post('/:id/create-agent', requireAdminRole('support'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const { businessName, industry, greeting, phoneNumber } = req.body || {};
  if (!businessName || typeof businessName !== 'string' || !businessName.trim()) {
    return res.status(400).json({ error: 'Business name is required' });
  }

  const cleanName = businessName.trim();
  const slug = `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;

  const { data, error } = await supabase
    .from('bots')
    .insert([{
      owner_id: req.params.id,
      business_name: cleanName,
      industry: (industry && typeof industry === 'string' && industry.trim()) ? industry.trim() : 'General',
      greeting: (greeting && typeof greeting === 'string' && greeting.trim())
        ? greeting.trim()
        : `Hello, thank you for calling ${cleanName}. How can I assist you today?`,
      knowledge_base: `Knowledge base for ${cleanName}.`,
      subdomain: slug,
      dograh_phone_number: (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim()) ? phoneNumber.trim() : null,
      is_active: true,
    }])
    .select('id, business_name, industry, dograh_phone_number, dograh_workflow_id, dograh_outbound_workflow_id, is_active, created_at, owner_id')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await audit(req, 'customer.create_agent', req.params.id, {
    botId: data.id,
    botName: data.business_name,
  });

  res.json({ ok: true, bot: data });
}));

export default router;
