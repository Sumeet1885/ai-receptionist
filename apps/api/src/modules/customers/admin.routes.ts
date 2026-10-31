import { randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import { LIMITS } from '@ai-receptionist/contracts';
import { config } from '../../config';
import { emailTemplates, sendEmail, sendEmailSafely } from '../../services/email';
import { supabase } from '../../services/db';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import { createActivationLink, createVerificationLink } from '../accounts/links';
import { adminOriginGuard, noStore, requireAdminRole, requireAdminSession, type AdminRequest } from '../admin-auth/middleware';
import { recordAudit } from '../admin-auth/repository';
import { getCustomer, listCustomers, setCustomerStatus } from './repository';
import { getCustomerConcurrentLimitInfo } from '../phone-calls/concurrentTracker';
import { refreshWorkspaceCallingLimits } from '../phone-calls/inboundRateLimiter';
import { isDograhConfigured, listTelephonyConfigs, listPhoneNumbers, listWorkflows } from '../phone-calls/dograhClient';

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

// Syncs external workflows and phone numbers directly created inside Dograh into the platform persona pool
router.post('/sync-dograh', requireAdminRole('support'), handle(async (req, res) => {
  if (!isDograhConfigured()) {
    return res.status(400).json({ error: 'Dograh is not configured (DOGRAH_API_KEY missing).' });
  }

  // 1. Fetch workflows from Dograh
  const workflows = await listWorkflows();

  // 2. Fetch telephony configurations and all phone numbers from Dograh
  const telephonyConfigs = await listTelephonyConfigs();
  const phoneWorkflowMap = new Map<string, string[]>(); // workflowId -> phoneNumbers[]

  for (const tc of telephonyConfigs) {
    try {
      const numbers = await listPhoneNumbers(tc.id);
      for (const num of numbers) {
        if (num.inbound_workflow_id && num.address) {
          const key = String(num.inbound_workflow_id);
          const list = phoneWorkflowMap.get(key) || [];
          const cleanAddr = num.address.trim();
          if (!list.includes(cleanAddr)) list.push(cleanAddr);
          phoneWorkflowMap.set(key, list);
        }
      }
    } catch {
      // Continue next config
    }
  }

  // 3. Fetch existing bots from Supabase
  const { data: existingBots, error: botFetchErr } = await supabase
    .from('bots')
    .select('id, business_name, dograh_workflow_id, dograh_phone_number, widget_config');

  if (botFetchErr) return res.status(500).json({ error: botFetchErr.message });

  const existingWfIds = new Set<string>();
  const existingPhones = new Set<string>();

  (existingBots || []).forEach((b: any) => {
    if (b.dograh_workflow_id) existingWfIds.add(String(b.dograh_workflow_id));
    if (b.dograh_phone_number) existingPhones.add(String(b.dograh_phone_number).trim());
  });

  const createdBots: any[] = [];
  const updatedBots: any[] = [];

  // 4. Process workflows created directly on Dograh
  for (const wf of workflows) {
    const wfIdStr = String(wf.id);
    const matchedPhones = phoneWorkflowMap.get(wfIdStr) || [];
    const matchedPhone = matchedPhones[0];

    if (existingWfIds.has(wfIdStr)) {
      // If bot exists in platform but was missing the phone line from Dograh, link it safely
      if (matchedPhone && !existingPhones.has(matchedPhone)) {
        const matchingBot = existingBots?.find((b: any) => String(b.dograh_workflow_id) === wfIdStr);
        if (matchingBot && !matchingBot.dograh_phone_number) {
          const existingWidget = (matchingBot.widget_config && typeof matchingBot.widget_config === 'object')
            ? matchingBot.widget_config
            : {};
          await supabase
            .from('bots')
            .update({
              dograh_phone_number: matchedPhone,
              widget_config: { ...existingWidget, phoneNumber: matchedPhone },
            })
            .eq('id', matchingBot.id);
          updatedBots.push(matchingBot.id);
          existingPhones.add(matchedPhone);
        }
      }
      continue;
    }

    // New workflow persona created on Dograh!
    const cleanName = (wf.name && wf.name.trim()) ? wf.name.trim() : `Dograh Persona ${wf.id}`;
    const slug = `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;

    const { data: newBot, error: insertErr } = await supabase
      .from('bots')
      .insert([{
        owner_id: null, // Genuinely unassigned pool persona available to any customer!
        business_name: cleanName,
        industry: 'General',
        greeting: `Hello, thank you for calling ${cleanName}. How can I assist you today?`,
        knowledge_base: `Knowledge base for ${cleanName}.`,
        subdomain: slug,
        dograh_workflow_id: wfIdStr,
        dograh_phone_number: matchedPhone || null,
        is_active: true,
        widget_config: {
          agentDirection: 'inbound',
          ...(matchedPhone ? { phoneNumber: matchedPhone } : {}),
        },
      }])
      .select('id, business_name, industry, dograh_phone_number, dograh_workflow_id, is_active, created_at, owner_id')
      .single();

    if (!insertErr && newBot) {
      createdBots.push(newBot);
      existingWfIds.add(wfIdStr);
      if (matchedPhone) existingPhones.add(matchedPhone);
    }
  }

  // 5. Also check standalone configured lines from Dograh
  for (const [wfId, phones] of phoneWorkflowMap.entries()) {
    for (const phone of phones) {
      if (!existingWfIds.has(wfId) && !existingPhones.has(phone)) {
        const cleanName = `Dograh Voice Line (${phone})`;
        const slug = `dograh-${phone.replace(/[^0-9]/g, '')}-${Date.now().toString(36)}`;
        const { data: newBot, error: insertErr } = await supabase
          .from('bots')
          .insert([{
            owner_id: null,
            business_name: cleanName,
            industry: 'Telephony',
            greeting: `Hello, thank you for calling. How can I assist you today?`,
            knowledge_base: `Knowledge base for ${cleanName}.`,
            subdomain: slug,
            dograh_workflow_id: wfId,
            dograh_phone_number: phone,
            is_active: true,
            widget_config: {
              agentDirection: 'inbound',
              phoneNumber: phone,
            },
          }])
          .select('id, business_name, industry, dograh_phone_number, dograh_workflow_id, is_active, created_at, owner_id')
          .single();

        if (!insertErr && newBot) {
          createdBots.push(newBot);
          existingWfIds.add(wfId);
          existingPhones.add(phone);
        }
      }
    }
  }

  await audit(req, 'dograh.sync_agents', 'system', {
    createdCount: createdBots.length,
    updatedCount: updatedBots.length,
    totalWorkflowsFound: workflows.length,
  });

  res.json({
    ok: true,
    createdCount: createdBots.length,
    updatedCount: updatedBots.length,
    createdBots,
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

async function getCustomerAgentLimitInfo(userId: string) {
  const { data: userRecord } = await supabase.auth.admin.getUserById(userId);
  const userMeta = userRecord?.user?.user_metadata || {};
  const customLimit = typeof userMeta.custom_agent_limit === 'number'
    ? userMeta.custom_agent_limit
    : (userMeta.custom_agent_limit ? parseInt(userMeta.custom_agent_limit, 10) : null);

  const { data: customerAccount } = await supabase
    .from('customer_accounts')
    .select('plan_id, plans(id, name, max_agents)')
    .eq('user_id', userId)
    .maybeSingle();

  const rawPlan = customerAccount?.plans;
  const plan = (Array.isArray(rawPlan) ? rawPlan[0] : rawPlan) as { id: string; name: string; max_agents: number | null } | null | undefined;
  const planLimit = plan !== undefined && plan !== null ? plan.max_agents : 1;
  const planName = plan?.name || 'Trial / Starter';

  const effectiveLimit = customLimit !== null && !isNaN(customLimit)
    ? customLimit
    : planLimit;

  return {
    customLimit: (customLimit !== null && !isNaN(customLimit)) ? customLimit : null,
    planLimit,
    planName,
    effectiveLimit,
  };
}

// Lists bots assigned to this customer as well as available bots across the workspace
router.get('/:id/agents', requireAdminRole('read_only'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });

  const { data: assigned, error: assignedErr } = await supabase
    .from('bots')
    .select('id, business_name, industry, dograh_phone_number, dograh_workflow_id, dograh_outbound_workflow_id, is_active, created_at, owner_id, widget_config')
    .eq('owner_id', req.params.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (assignedErr) return res.status(500).json({ error: assignedErr.message });

  const { data: allBots, error: allErr } = await supabase
    .from('bots')
    .select('id, business_name, industry, dograh_phone_number, dograh_workflow_id, dograh_outbound_workflow_id, is_active, created_at, owner_id, widget_config')
    .order('created_at', { ascending: false });

  if (allErr) return res.status(500).json({ error: allErr.message });

  // Extract distinct configured phone numbers across all bots and platform defaults
  const phoneSet = new Set<string>();
  if (config.defaultPhoneNumber) {
    phoneSet.add(config.defaultPhoneNumber);
  }
  (allBots || []).forEach((b: any) => {
    if (b.dograh_phone_number && typeof b.dograh_phone_number === 'string' && b.dograh_phone_number.trim()) {
      phoneSet.add(b.dograh_phone_number.trim());
    }
  });

  const limitInfo = await getCustomerAgentLimitInfo(req.params.id);
  const concurrentLimit = await getCustomerConcurrentLimitInfo(req.params.id);

  res.json({
    assigned: assigned || [],
    all: allBots || [],
    availableNumbers: Array.from(phoneSet),
    agentLimit: {
      current: (assigned || []).length,
      effectiveLimit: limitInfo.effectiveLimit,
      customLimit: limitInfo.customLimit,
      planLimit: limitInfo.planLimit,
      planName: limitInfo.planName,
    },
    concurrentLimit,
  });
}));

// Assigns an existing bot persona to a customer
router.post('/:id/assign-agent', requireAdminRole('support'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const { botId, direction } = req.body || {};
  if (!botId || !UUID.test(botId)) return res.status(400).json({ error: 'Valid botId is required' });

  // Check agent limit restriction
  const limitInfo = await getCustomerAgentLimitInfo(req.params.id);
  const { count: currentAssignedCount } = await supabase
    .from('bots')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', req.params.id)
    .eq('is_active', true);

  if (limitInfo.effectiveLimit !== null && (currentAssignedCount || 0) >= limitInfo.effectiveLimit) {
    return res.status(400).json({
      error: `Agent limit reached (${currentAssignedCount || 0} of ${limitInfo.effectiveLimit} assigned). Increase the agent limit or unassign an agent first.`
    });
  }

  const { data: bot, error: botErr } = await supabase
    .from('bots')
    .select('id, business_name, owner_id, widget_config')
    .eq('id', botId)
    .maybeSingle();

  if (botErr || !bot) return res.status(404).json({ error: 'Agent not found' });

  const agentDirection: 'inbound' | 'outbound' = direction === 'outbound' ? 'outbound' : 'inbound';
  const existingWidget = (bot.widget_config && typeof bot.widget_config === 'object') ? bot.widget_config : {};
  const updatedWidget = { ...existingWidget, agentDirection };

  // 1. If reassigned from another customer, stamp existing leads to prevent cross-customer lead leakage
  if (bot.owner_id && bot.owner_id !== req.params.id) {
    await supabase
      .from('leads')
      .update({ customer_id: bot.owner_id })
      .eq('bot_id', botId)
      .is('customer_id', null);

    await supabase
      .from('chat_sessions')
      .update({ customer_id: bot.owner_id })
      .eq('bot_id', botId)
      .is('customer_id', null);
  }

  const { error: updateErr } = await supabase
    .from('bots')
    .update({
      owner_id: req.params.id,
      widget_config: updatedWidget,
      is_active: true,
    })
    .eq('id', botId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await audit(req, 'customer.assign_agent', req.params.id, {
    botId,
    previousOwnerId: bot.owner_id,
    botName: bot.business_name,
    direction: agentDirection,
  });

  res.json({ ok: true, botId });
}));

// Updates dedicated direction (inbound / outbound / both) for an assigned bot
router.post('/:id/update-agent-direction', requireAdminRole('support'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const { botId, direction } = req.body || {};
  if (!botId || !UUID.test(botId)) return res.status(400).json({ error: 'Valid botId is required' });
  if (!['inbound', 'outbound'].includes(direction)) {
    return res.status(400).json({ error: 'Direction must be either inbound or outbound' });
  }

  const { data: bot, error: botErr } = await supabase
    .from('bots')
    .select('id, business_name, owner_id, widget_config')
    .eq('id', botId)
    .eq('owner_id', req.params.id)
    .maybeSingle();

  if (botErr || !bot) return res.status(404).json({ error: 'Agent not found' });

  const existingWidget = (bot.widget_config && typeof bot.widget_config === 'object') ? bot.widget_config : {};
  const updatedWidget = { ...existingWidget, agentDirection: direction };

  const { data: updatedBot, error: updateErr } = await supabase
    .from('bots')
    .update({ widget_config: updatedWidget })
    .eq('id', botId)
    .select('id, business_name, industry, dograh_phone_number, dograh_workflow_id, dograh_outbound_workflow_id, is_active, created_at, owner_id, widget_config')
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await audit(req, 'customer.update_agent_direction', req.params.id, {
    botId,
    botName: bot.business_name,
    direction,
  });

  res.json({ ok: true, bot: updatedBot });
}));

// Unassigns / soft-deactivates an agent persona from a customer (preserves historical leads and calls)
router.post('/:id/unassign-agent', requireAdminRole('support'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const { botId } = req.body || {};
  if (!botId || !UUID.test(botId)) return res.status(400).json({ error: 'Valid botId is required' });

  const { data: bot, error: botErr } = await supabase
    .from('bots')
    .select('id, business_name, owner_id, dograh_phone_number')
    .eq('id', botId)
    .maybeSingle();

  if (botErr || !bot) return res.status(404).json({ error: 'Agent not found' });

  // 1. Tag any un-stamped leads with current owner so history is preserved but isolated
  if (bot.owner_id) {
    await supabase
      .from('leads')
      .update({ customer_id: bot.owner_id })
      .eq('bot_id', botId)
      .is('customer_id', null);

    await supabase
      .from('chat_sessions')
      .update({ customer_id: bot.owner_id })
      .eq('bot_id', botId)
      .is('customer_id', null);
  }

  // 2. Genuinely unassign: detach owner_id and mark is_active = false
  // This ensures the former customer no longer sees the bot or its leads in their active workspace.
  const { error: updateErr } = await supabase
    .from('bots')
    .update({
      owner_id: null,
      is_active: false,
    })
    .eq('id', botId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await audit(req, 'customer.unassign_agent', req.params.id, {
    botId,
    botName: bot.business_name,
    previousPhoneNumber: bot.dograh_phone_number,
    action: 'soft_deactivate',
  });

  res.json({ ok: true, botId, unassigned: true });
}));

// Assigns or switches a plan for an existing customer
router.post('/:id/assign-plan', requireAdminRole('support'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const { planId, currency, expiryDate } = req.body || {};
  if (!planId || !UUID.test(planId)) return res.status(400).json({ error: 'Valid planId is required' });

  // 1. Fetch target plan
  const { data: plan, error: planErr } = await supabase
    .from('plans')
    .select('id, name, slug, is_active, is_trial, trial_days, monthly_minutes, max_agents, price_inr, price_usd')
    .eq('id', planId)
    .eq('is_active', true)
    .maybeSingle();

  if (planErr || !plan) {
    return res.status(400).json({ error: 'Selected plan is not active or could not be found' });
  }

  // 2. Fetch existing customer account
  const { data: account, error: accErr } = await supabase
    .from('customer_accounts')
    .select('user_id, plan_id, plan_currency, status')
    .eq('user_id', req.params.id)
    .maybeSingle();

  if (accErr || !account) {
    return res.status(404).json({ error: 'Customer account not found' });
  }

  // 3. Compute period dates
  const startsAt = new Date();
  let periodEnd: Date;
  if (expiryDate) {
    periodEnd = new Date(`${expiryDate}T23:59:59+05:30`);
    if (isNaN(periodEnd.getTime())) {
      return res.status(400).json({ error: 'Invalid expiry date format' });
    }
  } else if (plan.is_trial) {
    periodEnd = new Date(startsAt.getTime() + (plan.trial_days || 7) * 24 * 60 * 60 * 1000);
  } else {
    // 1 calendar month ahead
    periodEnd = new Date(startsAt);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const chosenCurrency = ['INR', 'USD'].includes(currency)
    ? currency
    : account.plan_currency || (plan.price_usd > 0 && !plan.price_inr ? 'USD' : 'INR');

  const baseUpdates: any = {
    plan_id: plan.id,
    plan_currency: chosenCurrency,
    plan_started_at: startsAt.toISOString(),
    current_period_end: periodEnd.toISOString(),
    access_expires_at: periodEnd.toISOString(),
    access_end_date: expiryDate || null,
    access_months: plan.is_trial ? null : 1,
    trial_days: plan.is_trial ? (plan.trial_days || 7) : null,
    trial_started_at: plan.is_trial ? startsAt.toISOString() : null,
    trial_ends_at: plan.is_trial ? periodEnd.toISOString() : null,
    status: 'active',
    updated_at: new Date().toISOString(),
  };

  let updateRes = await supabase
    .from('customer_accounts')
    .update({ ...baseUpdates, call_minutes_quota: plan.monthly_minutes ?? null })
    .eq('user_id', req.params.id);

  if (updateRes.error && (updateRes.error.message?.includes('call_minutes_quota') || updateRes.error.code === 'PGRST204' || updateRes.error.code === '42703')) {
    updateRes = await supabase
      .from('customer_accounts')
      .update(baseUpdates)
      .eq('user_id', req.params.id);
  }

  if (updateRes.error) {
    return res.status(500).json({ error: updateRes.error.message });
  }

  // Record plan assignment / change in billing_orders so it appears in purchase history
  try {
    const { data: userAuth } = await supabase.auth.admin.getUserById(req.params.id);
    const fullName = userAuth?.user?.user_metadata?.full_name || userAuth?.user?.user_metadata?.name || 'Customer';
    const email = userAuth?.user?.email || '';
    const isUpgrade = Boolean(account.plan_id);
    const purchaseKind = isUpgrade ? 'plan_change' : 'initial';
    const planSnapshot = {
      ...plan,
      purchase_kind: purchaseKind,
      target_period_start: startsAt.toISOString(),
      target_period_end: periodEnd.toISOString(),
      admin_assigned: true,
    };
    const orderPayload: any = {
      customer_user_id: req.params.id,
      provisioned_user_id: req.params.id,
      plan_id: plan.id,
      plan_snapshot: planSnapshot,
      currency: chosenCurrency,
      plan_amount: chosenCurrency === 'INR' ? plan.price_inr : plan.price_usd,
      setup_fee: 0,
      discount: 0,
      total: chosenCurrency === 'INR' ? plan.price_inr : plan.price_usd,
      full_name: fullName,
      email: email.toLowerCase(),
      phone: '',
      business_name: fullName,
      status: 'provisioned',
      paid_at: startsAt.toISOString(),
      provisioned_at: startsAt.toISOString(),
      razorpay_payment_id: `admin_${randomBytes(6).toString('hex')}`,
      ip: getClientIp(req) || '127.0.0.1',
      user_agent: req.get('user-agent') || 'admin_console',
    };
    const { data: createdOrder } = await supabase.from('billing_orders').insert(orderPayload).select('id').maybeSingle();
    if (createdOrder) {
      await supabase.from('customer_accounts').update({ billing_order_id: createdOrder.id }).eq('user_id', req.params.id);
    }
  } catch {
    // Non-blocking for the plan assignment
  }

  await audit(req, 'customer.assign_plan', req.params.id, {
    previousPlanId: account.plan_id,
    newPlanId: plan.id,
    newPlanName: plan.name,
    currency: chosenCurrency,
    periodEnd: periodEnd.toISOString(),
  });

  try {
    await refreshWorkspaceCallingLimits(supabase, req.params.id);
  } catch (refreshErr) {
    console.warn('[assign-plan] refreshWorkspaceCallingLimits failed:', refreshErr);
  }

  // Send plan update notification email to the customer
  try {
    const { data: userAuth } = await supabase.auth.admin.getUserById(req.params.id);
    const customerEmail = userAuth?.user?.email;
    const customerName = userAuth?.user?.user_metadata?.full_name || userAuth?.user?.user_metadata?.name || 'there';
    if (customerEmail) {
      void sendEmailSafely(
        customerEmail,
        emailTemplates.planUpdateNotice({
          name: customerName,
          planName: plan.name,
          monthlyMinutes: plan.monthly_minutes,
          periodEnd: periodEnd ? periodEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null,
          dashboardUrl: `${config.clientUrl}/dashboard`,
        }),
        'customer_plan_updated'
      ).catch(() => undefined);
    }
  } catch {
    // Non-blocking
  }

  res.json({
    ok: true,
    plan: {
      id: plan.id,
      name: plan.name,
      currency: chosenCurrency,
      periodEnd: periodEnd.toISOString(),
      startsAt: startsAt.toISOString(),
    },
  });
}));

// Updates the custom agent limit restriction for a customer
router.post('/:id/agent-limit', requireAdminRole('support'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const { limit } = req.body || {};

  let customLimit: number | null = null;
  if (limit !== null && limit !== undefined && limit !== '') {
    const parsed = parseInt(String(limit), 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 500) {
      return res.status(400).json({ error: 'Agent limit must be between 1 and 500, or null to follow plan default' });
    }
    customLimit = parsed;
  }

  const { data: userRecord, error: userErr } = await supabase.auth.admin.getUserById(req.params.id);
  if (userErr || !userRecord?.user) return res.status(404).json({ error: 'Customer not found' });

  const currentMeta = userRecord.user.user_metadata || {};
  const updatedMeta = { ...currentMeta, custom_agent_limit: customLimit };

  const { error: updateErr } = await supabase.auth.admin.updateUserById(req.params.id, {
    user_metadata: updatedMeta,
  });

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await audit(req, 'customer.update_agent_limit', req.params.id, {
    customLimit,
    previousLimit: currentMeta.custom_agent_limit ?? null,
  });

  const limitInfo = await getCustomerAgentLimitInfo(req.params.id);
  const { count: currentAssignedCount } = await supabase
    .from('bots')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', req.params.id);

  res.json({
    ok: true,
    agentLimit: {
      current: currentAssignedCount || 0,
      effectiveLimit: limitInfo.effectiveLimit,
      customLimit: limitInfo.customLimit,
      planLimit: limitInfo.planLimit,
      planName: limitInfo.planName,
    },
  });
}));

// Assigns or updates a phone number on a customer bot
router.post('/:id/assign-number', requireAdminRole('support'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const { botId, phoneNumber } = req.body || {};
  if (!botId || !UUID.test(botId)) return res.status(400).json({ error: 'Valid botId is required' });
  if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
    return res.status(400).json({ error: 'Valid phone number is required' });
  }

  const cleanPhone = phoneNumber.trim();

  const { data: bot, error: botErr } = await supabase
    .from('bots')
    .select('id, business_name, owner_id, widget_config')
    .eq('id', botId)
    .maybeSingle();

  if (botErr || !bot) return res.status(404).json({ error: 'Agent not found' });

  const existingWidget = (bot.widget_config && typeof bot.widget_config === 'object') ? bot.widget_config : {};
  const updatedWidget = {
    ...existingWidget,
    phoneNumber: cleanPhone,
  };

  const { data: updatedBot, error: updateErr } = await supabase
    .from('bots')
    .update({
      dograh_phone_number: cleanPhone,
      widget_config: updatedWidget,
    })
    .eq('id', botId)
    .select('id, business_name, industry, dograh_phone_number, dograh_workflow_id, dograh_outbound_workflow_id, is_active, created_at, owner_id')
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await audit(req, 'customer.assign_phone_number', req.params.id, {
    botId,
    botName: bot.business_name,
    phoneNumber: cleanPhone,
  });

  res.json({ ok: true, bot: updatedBot });
}));

// Unassigns / removes direct phone line from a customer bot
router.post('/:id/unassign-number', requireAdminRole('support'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const { botId } = req.body || {};
  if (!botId || !UUID.test(botId)) return res.status(400).json({ error: 'Valid botId is required' });

  const { data: bot, error: botErr } = await supabase
    .from('bots')
    .select('id, business_name, owner_id, widget_config, dograh_phone_number')
    .eq('id', botId)
    .maybeSingle();

  if (botErr || !bot) return res.status(404).json({ error: 'Agent not found' });

  const existingWidget = (bot.widget_config && typeof bot.widget_config === 'object') ? { ...(bot.widget_config as any) } : {};
  delete existingWidget.phoneNumber;

  const { data: updatedBot, error: updateErr } = await supabase
    .from('bots')
    .update({
      dograh_phone_number: null,
      widget_config: existingWidget,
    })
    .eq('id', botId)
    .select('id, business_name, industry, dograh_phone_number, dograh_workflow_id, dograh_outbound_workflow_id, is_active, created_at, owner_id')
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await audit(req, 'customer.unassign_phone_number', req.params.id, {
    botId,
    botName: bot.business_name,
    previousPhoneNumber: bot.dograh_phone_number,
  });

  res.json({ ok: true, bot: updatedBot });
}));

// Creates and provisions a new bot persona directly assigned to the customer
router.post('/:id/create-agent', requireAdminRole('support'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const { businessName, industry, greeting, phoneNumber, direction } = req.body || {};
  if (!businessName || typeof businessName !== 'string' || !businessName.trim()) {
    return res.status(400).json({ error: 'Business name is required' });
  }

  // Check agent limit restriction
  const limitInfo = await getCustomerAgentLimitInfo(req.params.id);
  const { count: currentAssignedCount } = await supabase
    .from('bots')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', req.params.id)
    .eq('is_active', true);

  if (limitInfo.effectiveLimit !== null && (currentAssignedCount || 0) >= limitInfo.effectiveLimit) {
    return res.status(400).json({
      error: `Agent limit reached (${currentAssignedCount || 0} of ${limitInfo.effectiveLimit} assigned). Increase the agent limit or unassign an agent first.`
    });
  }

  const cleanName = businessName.trim();
  const slug = `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
  const agentDirection = ['inbound', 'outbound', 'both'].includes(direction) ? direction : 'both';

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
      widget_config: {
        agentDirection,
        ...(phoneNumber ? { phoneNumber: phoneNumber.trim() } : {}),
      },
    }])
    .select('id, business_name, industry, dograh_phone_number, dograh_workflow_id, dograh_outbound_workflow_id, is_active, created_at, owner_id, widget_config')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await audit(req, 'customer.create_agent', req.params.id, {
    botId: data.id,
    botName: data.business_name,
    direction: agentDirection,
  });

  res.json({ ok: true, bot: data });
}));

// Returns aggregated usage (inbound/outbound call counts and minutes) for the customer's agents
router.get('/:id/usage', requireAdminRole('read_only'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });

  const { data: bots, error: botsErr } = await supabase
    .from('bots')
    .select('id, business_name, dograh_outbound_workflow_id')
    .eq('owner_id', req.params.id);

  if (botsErr) return res.status(500).json({ error: botsErr.message });

  if (!bots || bots.length === 0) {
    return res.json({
      inboundCalls: 0,
      inboundSeconds: 0,
      inboundMinutes: 0,
      outboundCalls: 0,
      outboundSeconds: 0,
      outboundMinutes: 0,
      totalCalls: 0,
      totalSeconds: 0,
      totalMinutes: 0,
      botsCount: 0,
    });
  }

  const botIds = bots.map((b) => b.id);
  const outboundWorkflowIds = new Set(
    bots.map((b) => b.dograh_outbound_workflow_id).filter((id): id is string => Boolean(id))
  );

  const { data: calls, error: callsErr } = await supabase
    .from('phone_calls')
    .select('id, bot_id, duration_seconds, cost_info, dograh_workflow_id')
    .in('bot_id', botIds);

  if (callsErr) return res.status(500).json({ error: callsErr.message });

  let inboundCalls = 0;
  let inboundSeconds = 0;
  let outboundCalls = 0;
  let outboundSeconds = 0;

  for (const call of (calls || [])) {
    const dur = Math.max(0, Number(call.duration_seconds) || 0);
    const costInfo = call.cost_info as Record<string, unknown> | null;
    const direction = typeof costInfo === 'object' && costInfo !== null ? (costInfo as any).direction : null;
    const isOutbound = direction === 'outbound' || (call.dograh_workflow_id && outboundWorkflowIds.has(call.dograh_workflow_id));

    if (isOutbound) {
      outboundCalls += 1;
      outboundSeconds += dur;
    } else {
      inboundCalls += 1;
      inboundSeconds += dur;
    }
  }

  const totalCalls = inboundCalls + outboundCalls;
  const totalSeconds = inboundSeconds + outboundSeconds;

  res.json({
    inboundCalls,
    inboundSeconds,
    inboundMinutes: Math.round((inboundSeconds / 60) * 10) / 10,
    outboundCalls,
    outboundSeconds,
    outboundMinutes: Math.round((outboundSeconds / 60) * 10) / 10,
    totalCalls,
    totalSeconds,
    totalMinutes: Math.round((totalSeconds / 60) * 10) / 10,
    botsCount: bots.length,
  });
}));

// Gets the parallel calls / concurrent calls limit for a customer
router.get('/:id/concurrent-limit', requireAdminRole('read_only'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const concurrentLimit = await getCustomerConcurrentLimitInfo(req.params.id);
  res.json({ ok: true, concurrentLimit });
}));

// Updates the custom parallel calls / concurrent calls limit for a customer
router.post('/:id/concurrent-limit', requireAdminRole('support'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Customer not found' });
  const { limit } = req.body || {};

  let customLimit: number | null = null;
  if (limit !== null && limit !== undefined && limit !== '') {
    const parsed = parseInt(String(limit), 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 100) {
      return res.status(400).json({ error: 'Parallel call limit must be between 1 and 100, or null to follow plan default' });
    }
    customLimit = parsed;
  }

  const { data: userRecord, error: userErr } = await supabase.auth.admin.getUserById(req.params.id);
  if (userErr || !userRecord?.user) return res.status(404).json({ error: 'Customer not found' });

  const currentMeta = userRecord.user.user_metadata || {};
  const updatedMeta = { ...currentMeta, custom_concurrent_calls_limit: customLimit };

  const { error: updateErr } = await supabase.auth.admin.updateUserById(req.params.id, {
    user_metadata: updatedMeta,
  });

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await audit(req, 'customer.update_concurrent_limit', req.params.id, {
    customLimit,
    previousLimit: currentMeta.custom_concurrent_calls_limit ?? null,
  });

  const concurrentLimit = await getCustomerConcurrentLimitInfo(req.params.id);
  res.json({ ok: true, concurrentLimit });
}));

export default router;
