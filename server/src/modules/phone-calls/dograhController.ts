import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { supabase } from '../../services/db';
import { config } from '../../config';
import { mergeWidgetConfig } from '../../utils/widgetConfig';
import { validateContactInput } from '../../utils/contactValidation';
import { buildDograhOutboundInstruction, buildDograhPhoneInstruction, withoutAutoKnownPhoneField } from './receptionistInstruction';
import { syncBotCalls } from './callMirror';
import {
  assignInboundWorkflow,
  createEndCallTool,
  createHttpTool,
  createWorkflowFromDefinition,
  initiateCall,
  listPhoneNumbers,
  listTelephonyConfigs,
  publishWorkflow,
  updateEndCallTool,
  updateHttpTool,
  updateWorkflowInPlace,
} from './dograhClient';
import { DograhProvisionableBot } from './types';
import { buildCapacityWorkflowDefinition, buildLeadExtractionVariables, buildSingleNodeWorkflowDefinition, MAX_CALL_DURATION_SECONDS } from './workflowDefinition';

// Dograh has no per-bot timezone input on a phone call (no browser to read it from), so the
// phone persona uses a fixed default. Matches the IST-leaning default used elsewhere in the app.
const PHONE_DEFAULT_TIMEZONE = 'Asia/Kolkata';

const WORKFLOW_CONFIGURATIONS = { max_call_duration: MAX_CALL_DURATION_SECONDS };
const CAPACITY_WORKFLOW_CONFIGURATIONS = { max_call_duration: 15 };

function maskPhoneNumber(phoneNumber: string): string {
  if (phoneNumber.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, phoneNumber.length - 4))}${phoneNumber.slice(-4)}`;
}

async function loadOwnedBot(botId: string, ownerId: string): Promise<DograhProvisionableBot | null> {
  const { data, error } = await supabase
    .from('bots')
    .select(
      'id, owner_id, business_name, industry, knowledge_base, widget_config, primary_color, dograh_workflow_id, dograh_outbound_workflow_id, dograh_capacity_workflow_id, dograh_telephony_config_id, dograh_phone_number_id, dograh_phone_number, dograh_check_availability_tool_uuid, dograh_book_appointment_tool_uuid, dograh_call_time_tool_uuid, dograh_rate_limit_tool_uuid, dograh_outbound_cooldown_seconds, dograh_outbound_hourly_cap, dograh_inbound_cooldown_seconds, dograh_inbound_hourly_cap, dograh_inbound_active_workflow, dograh_inbound_rate_limited_until'
    )
    .eq('id', botId)
    .eq('owner_id', ownerId)
    .single();

  if (error || !data) return null;
  return data;
}

async function isCalendarConnected(ownerId: string): Promise<boolean> {
  const { data } = await supabase.from('calendar_connections').select('provider').eq('owner_id', ownerId).maybeSingle();
  return Boolean(data?.provider);
}

interface PhoneToolUuids {
  checkAvailabilityToolUuid: string;
  bookAppointmentToolUuid: string;
}

/**
 * Creates (first provision) or updates (every re-provision after that) the two Dograh tools that
 * let the phone agent call back into this server for live calendar booking - check_availability
 * and book_appointment, mirroring the Gemini Live web-voice tool contract (liveTools.ts) so the
 * persona instruction (buildToolBasedBookingInstruction) describes the same two tools regardless
 * of channel. The bot's own id is baked into each tool's URL; session_id is injected by Dograh at
 * call time from initial_context (populated by the pre-call-fetch hit on phoneToolsController.preCall).
 */
async function ensurePhoneTools(bot: DograhProvisionableBot): Promise<PhoneToolUuids> {
  const apiKeyHeader = { 'X-API-Key': config.phoneTools.apiKey };
  const base = `${config.phoneTools.callbackBaseUrl}/api/phone-tools/${bot.id}`;

  const checkAvailabilityParams = {
    name: `Check Availability - ${bot.business_name}`,
    description: 'Check available appointment slots for a given date. Returns start and end times of free slots.',
    url: `${base}/check-availability`,
    method: 'POST' as const,
    headers: apiKeyHeader,
    parameters: [
      { name: 'date', type: 'string' as const, description: 'Date in YYYY-MM-DD format', required: true },
    ],
  };
  const bookAppointmentParams = {
    name: `Book Appointment - ${bot.business_name}`,
    description: 'Book an appointment slot. Ensure availability was checked first and the caller has agreed to the specific slot.',
    url: `${base}/book-appointment`,
    method: 'POST' as const,
    headers: apiKeyHeader,
    parameters: [
      { name: 'title', type: 'string' as const, description: 'Title of the appointment', required: true },
      { name: 'visitorName', type: 'string' as const, description: 'Caller full name', required: false },
      { name: 'visitorPhone', type: 'string' as const, description: 'Caller phone number', required: false },
      { name: 'visitorEmail', type: 'string' as const, description: 'Caller email address', required: false },
      { name: 'startTime', type: 'string' as const, description: 'Start time in ISO 8601 format', required: true },
      { name: 'endTime', type: 'string' as const, description: 'End time in ISO 8601 format', required: true },
    ],
    presetParameters: [
      { name: 'session_id', type: 'string' as const, value_template: '{{initial_context.session_id}}' },
    ],
  };

  let checkAvailabilityToolUuid = bot.dograh_check_availability_tool_uuid;
  if (checkAvailabilityToolUuid) {
    await updateHttpTool(checkAvailabilityToolUuid, checkAvailabilityParams);
  } else {
    checkAvailabilityToolUuid = (await createHttpTool(checkAvailabilityParams)).tool_uuid;
  }

  let bookAppointmentToolUuid = bot.dograh_book_appointment_tool_uuid;
  if (bookAppointmentToolUuid) {
    await updateHttpTool(bookAppointmentToolUuid, bookAppointmentParams);
  } else {
    bookAppointmentToolUuid = (await createHttpTool(bookAppointmentParams)).tool_uuid;
  }

  return { checkAvailabilityToolUuid, bookAppointmentToolUuid };
}

/**
 * Creates/updates the get_call_time_remaining tool - always attached, regardless of calendar
 * connection, since it's what lets the persona end the call gracefully near
 * MAX_CALL_DURATION_SECONDS instead of either guessing elapsed time from exchange count or
 * relying solely on Dograh's silent hard abort. See workflowDefinition.ts and
 * phoneToolsController.ts for the full mechanism.
 */
async function ensureCallTimeTool(bot: DograhProvisionableBot): Promise<string> {
  const params = {
    name: `Check Call Time Remaining - ${bot.business_name}`,
    description: 'Check how much time is left on this call before it should wrap up. Call this periodically, more often as the call goes on, to know when to start closing the conversation.',
    url: `${config.phoneTools.callbackBaseUrl}/api/phone-tools/${bot.id}/call-time-remaining`,
    method: 'POST' as const,
    headers: { 'X-API-Key': config.phoneTools.apiKey },
    presetParameters: [
      { name: 'session_id', type: 'string' as const, value_template: '{{initial_context.session_id}}' },
    ],
  };

  if (bot.dograh_call_time_tool_uuid) {
    await updateHttpTool(bot.dograh_call_time_tool_uuid, params);
    return bot.dograh_call_time_tool_uuid;
  }
  return (await createHttpTool(params)).tool_uuid;
}

/**
 * Creates/updates the inbound capacity end_call tool. No recording or generated speech is used:
 * the at-capacity workflow calls this tool with messageType "none" and the call disconnects.
 */
async function ensureRateLimitTool(bot: DograhProvisionableBot): Promise<string> {
  const params = {
    name: `Capacity Hangup - ${bot.business_name}`,
    description: 'Call this immediately when this inbound number is at capacity. End the call silently; say nothing.',
  };

  if (bot.dograh_rate_limit_tool_uuid) {
    await updateEndCallTool(bot.dograh_rate_limit_tool_uuid, params);
    return bot.dograh_rate_limit_tool_uuid;
  }
  return (await createEndCallTool(params)).tool_uuid;
}

async function ensureCapacityWorkflow(bot: DograhProvisionableBot, endCallToolUuid: string) {
  const definition = buildCapacityWorkflowDefinition(endCallToolUuid);
  const workflow = bot.dograh_capacity_workflow_id
    ? await updateWorkflowInPlace(bot.dograh_capacity_workflow_id, definition, CAPACITY_WORKFLOW_CONFIGURATIONS)
    : await createWorkflowFromDefinition(`AI receptionist capacity hangup for ${bot.business_name}`, definition, CAPACITY_WORKFLOW_CONFIGURATIONS);
  await publishWorkflow(workflow.id);
  return workflow;
}

export async function getStatus(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  res.json({
    provisioned: Boolean(bot.dograh_workflow_id),
    outboundProvisioned: Boolean(bot.dograh_outbound_workflow_id),
    phoneNumber: bot.dograh_phone_number || null,
    inboundActiveWorkflow: bot.dograh_inbound_active_workflow || 'normal',
    inboundRateLimitedUntil: bot.dograh_inbound_rate_limited_until || null,
    outboundCooldownSeconds: bot.dograh_outbound_cooldown_seconds ?? 10,
    outboundHourlyCap: bot.dograh_outbound_hourly_cap ?? 20,
    inboundCooldownSeconds: bot.dograh_inbound_cooldown_seconds ?? 10,
    inboundHourlyCap: bot.dograh_inbound_hourly_cap ?? 20,
  });
}

export async function provisionBot(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  try {
    const widgetConfig = mergeWidgetConfig((bot as any).widget_config, bot);
    // Phone number is already known from telephony metadata on both directions - don't ask the
    // caller to read it back, and don't generate a useless caller_phone extraction slot for it.
    const extractionVariables = buildLeadExtractionVariables(withoutAutoKnownPhoneField(widgetConfig));

    // get_call_time_remaining is always attached (drives the graceful 4:30 wrap-up regardless of
    // calendar booking - see workflowDefinition.ts), so pre-call-fetch (which creates the
    // chat_sessions row every tool reads session_id from) is always enabled now too. The
    // `direction` query param tells phoneToolsController.preCall which one this is, since the
    // inbound rate limit only applies to calls Dograh answers, never ones we ourselves placed
    // (those are already gated before dialing - see checkOutboundRateLimit/callOut below).
    const callTimeToolUuid = await ensureCallTimeTool(bot);
    const rateLimitToolUuid = await ensureRateLimitTool(bot);
    const preCallFetchBase = `${config.phoneTools.callbackBaseUrl}/api/phone-tools/${botId}/pre-call?key=${config.phoneTools.apiKey}`;
    const inboundPreCallFetchUrl = `${preCallFetchBase}&direction=inbound`;
    const outboundPreCallFetchUrl = `${preCallFetchBase}&direction=outbound`;

    // Tool-driven booking (real-time check_availability/book_appointment against the owner's
    // connected Google Calendar) only when a calendar is actually connected and the bot has
    // calendar booking enabled - otherwise the persona falls back to the verbal-handoff
    // instruction exactly as before, and no calendar tools are attached.
    const useTools = widgetConfig.enableCalendar && (await isCalendarConnected(bot.owner_id));
    let checkAvailabilityToolUuid = bot.dograh_check_availability_tool_uuid;
    let bookAppointmentToolUuid = bot.dograh_book_appointment_tool_uuid;
    if (useTools) {
      const tools = await ensurePhoneTools(bot);
      checkAvailabilityToolUuid = tools.checkAvailabilityToolUuid;
      bookAppointmentToolUuid = tools.bookAppointmentToolUuid;
    }
    const toolUuids = useTools && checkAvailabilityToolUuid && bookAppointmentToolUuid
      ? [callTimeToolUuid, checkAvailabilityToolUuid, bookAppointmentToolUuid]
      : [callTimeToolUuid];

    // One click provisions both directions: the inbound (answering) agent and the outbound
    // (calling-out) agent. They are always provisioned together, which keeps the poller's
    // "has a workflow" eligibility check simple — see callPoller.ts. Each is a hand-authored
    // single-conversation-node graph (workflowDefinition.ts), not Dograh's AI-generated
    // create/template graph — see "Phone calls/README.md" for why.
    const inboundInstruction = buildDograhPhoneInstruction(bot, widgetConfig, { timezone: PHONE_DEFAULT_TIMEZONE, useToolBasedBooking: useTools });
    const inboundDefinition = buildSingleNodeWorkflowDefinition({
      personaPrompt: inboundInstruction,
      extractionVariables,
      isOutbound: false,
      businessName: bot.business_name,
      toolUuids,
      preCallFetchUrl: inboundPreCallFetchUrl,
    });
    const inboundWorkflow = bot.dograh_workflow_id
      ? await updateWorkflowInPlace(bot.dograh_workflow_id, inboundDefinition, WORKFLOW_CONFIGURATIONS)
      : await createWorkflowFromDefinition(`AI receptionist for ${bot.business_name}`, inboundDefinition, WORKFLOW_CONFIGURATIONS);
    await publishWorkflow(inboundWorkflow.id);

    const outboundInstruction = buildDograhOutboundInstruction(bot, widgetConfig, { timezone: PHONE_DEFAULT_TIMEZONE, useToolBasedBooking: useTools });
    const outboundDefinition = buildSingleNodeWorkflowDefinition({
      personaPrompt: outboundInstruction,
      extractionVariables,
      isOutbound: true,
      businessName: bot.business_name,
      toolUuids,
      preCallFetchUrl: outboundPreCallFetchUrl,
    });
    const outboundWorkflow = bot.dograh_outbound_workflow_id
      ? await updateWorkflowInPlace(bot.dograh_outbound_workflow_id, outboundDefinition, WORKFLOW_CONFIGURATIONS)
      : await createWorkflowFromDefinition(`AI outbound caller for ${bot.business_name}`, outboundDefinition, WORKFLOW_CONFIGURATIONS);
    await publishWorkflow(outboundWorkflow.id);

    const capacityWorkflow = await ensureCapacityWorkflow(bot, rateLimitToolUuid);

    const { error } = await supabase
      .from('bots')
      .update({
        dograh_workflow_id: String(inboundWorkflow.id),
        dograh_outbound_workflow_id: String(outboundWorkflow.id),
        dograh_capacity_workflow_id: String(capacityWorkflow.id),
        dograh_check_availability_tool_uuid: checkAvailabilityToolUuid,
        dograh_book_appointment_tool_uuid: bookAppointmentToolUuid,
        dograh_call_time_tool_uuid: callTimeToolUuid,
        dograh_rate_limit_tool_uuid: rateLimitToolUuid,
      })
      .eq('id', botId);
    if (error) throw error;

    res.json({
      dograhWorkflowId: String(inboundWorkflow.id),
      dograhOutboundWorkflowId: String(outboundWorkflow.id),
      dograhCapacityWorkflowId: String(capacityWorkflow.id),
    });
  } catch (err: any) {
    console.error('[phone-calls] Provisioning failed:', err);
    res.status(502).json({ error: err.message || 'Failed to provision the Dograh phone agent' });
  }
}

export async function listNumbers(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.query.botId as string | undefined;
  const bot = botId ? await loadOwnedBot(botId, req.user!.id) : null;
  if (botId && !bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  try {
    // Numbers claimed by any OTHER bot are hidden from the picker. Dograh is a single
    // org/service account, so this app-level filter is what gives us tenant isolation.
    const { data: claimedRows } = await supabase
      .from('bots')
      .select('id, dograh_phone_number_id')
      .not('dograh_phone_number_id', 'is', null);
    const claimedByOtherBot = new Set(
      (claimedRows || [])
        .filter((row: any) => row.id !== botId)
        .map((row: any) => row.dograh_phone_number_id)
    );

    const configs = await listTelephonyConfigs();
    const numbers = [];
    for (const tc of configs) {
      const phoneNumbers = await listPhoneNumbers(tc.id);
      for (const number of phoneNumbers) {
        if (claimedByOtherBot.has(String(number.id))) continue;
        numbers.push({
          telephonyConfigId: tc.id,
          telephonyConfigName: tc.name,
          phoneNumberId: number.id,
          address: number.address,
          label: number.label,
          isAssignedToThisBot: bot ? String(number.id) === bot.dograh_phone_number_id : false,
        });
      }
    }

    res.json({ numbers });
  } catch (err: any) {
    console.error('[phone-calls] Listing numbers failed:', err);
    res.status(502).json({ error: err.message || 'Failed to list Dograh phone numbers' });
  }
}

export async function assignNumber(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const { telephonyConfigId, phoneNumberId } = req.body || {};
  if (!telephonyConfigId || !phoneNumberId) {
    res.status(400).json({ error: 'telephonyConfigId and phoneNumberId are required' });
    return;
  }

  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }
  if (!bot.dograh_workflow_id) {
    res.status(400).json({ error: 'Provision the phone agent before assigning a number' });
    return;
  }

  // Re-check the number is not claimed by a different bot. The DB unique index on
  // dograh_phone_number_id is the hard backstop; this is the friendly pre-check.
  const { data: claimant } = await supabase
    .from('bots')
    .select('id')
    .eq('dograh_phone_number_id', String(phoneNumberId))
    .neq('id', botId)
    .maybeSingle();
  if (claimant) {
    res.status(409).json({ error: 'This number is already assigned to another receptionist' });
    return;
  }

  try {
    const rateLimitedUntil = bot.dograh_inbound_rate_limited_until ? new Date(bot.dograh_inbound_rate_limited_until) : null;
    const shouldKeepCapacity =
      bot.dograh_inbound_active_workflow === 'capacity' &&
      bot.dograh_capacity_workflow_id &&
      rateLimitedUntil &&
      rateLimitedUntil.getTime() > Date.now();
    const workflowId = shouldKeepCapacity ? bot.dograh_capacity_workflow_id! : bot.dograh_workflow_id;
    const number = await assignInboundWorkflow(telephonyConfigId, phoneNumberId, workflowId);

    const { error } = await supabase
      .from('bots')
      .update({
        dograh_telephony_config_id: String(telephonyConfigId),
        dograh_phone_number_id: String(phoneNumberId),
        dograh_phone_number: number.address,
        dograh_inbound_active_workflow: shouldKeepCapacity ? 'capacity' : 'normal',
        dograh_inbound_rate_limited_until: shouldKeepCapacity ? bot.dograh_inbound_rate_limited_until : null,
      })
      .eq('id', botId);
    if (error) throw error;

    res.json({ phoneNumber: number.address });
  } catch (err: any) {
    console.error('[phone-calls] Assigning number failed:', err);
    res.status(502).json({ error: err.message || 'Failed to assign the phone number' });
  }
}

export async function listCalls(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  const { data: calls, error } = await supabase
    .from('phone_calls')
    .select('id, session_id, caller_number, status, duration_seconds, recording_url, transcript_url, started_at, created_at, ingest_status')
    .eq('bot_id', botId)
    .order('created_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const sessionIds = (calls || []).map(call => call.session_id).filter(Boolean);
  const { data: leads } = sessionIds.length
    ? await supabase.from('leads').select('session_id, name, lead_score, summary, appointment_status').in('session_id', sessionIds)
    : { data: [] as any[] };
  const leadsBySession = new Map((leads || []).map((lead: any) => [lead.session_id, lead]));

  res.json({
    calls: (calls || []).map(call => ({
      ...call,
      lead: call.session_id ? leadsBySession.get(call.session_id) || null : null,
    })),
  });
}

// In-memory, single-process rate limiting on outbound dialing - same constraint as the poller
// (process-local/single-replica), acceptable for a single deliberate dial action by the bot's
// own owner. Caps a runaway loop (buggy client retry, compromised owner session) from dialing
// the same number or burning through the org's outbound minutes unbounded. Thresholds are
// per-bot and owner-configurable (dograh_outbound_cooldown_seconds/dograh_outbound_hourly_cap -
// see updateOutboundRateLimit), defaulting to 10s/20-per-hour for bots that haven't set their own.
const DEFAULT_OUTBOUND_COOLDOWN_SECONDS = 10;
const DEFAULT_OUTBOUND_HOURLY_CAP = 20;
const MAX_OUTBOUND_COOLDOWN_SECONDS = 300;
const MAX_OUTBOUND_HOURLY_CAP = 200;
const lastCallAtByBot = new Map<string, number>();
const callTimestampsByBot = new Map<string, number[]>();

function checkOutboundRateLimit(bot: DograhProvisionableBot): string | null {
  const now = Date.now();
  const cooldownMs = (bot.dograh_outbound_cooldown_seconds ?? DEFAULT_OUTBOUND_COOLDOWN_SECONDS) * 1000;
  const hourlyCap = bot.dograh_outbound_hourly_cap ?? DEFAULT_OUTBOUND_HOURLY_CAP;

  const lastCallAt = lastCallAtByBot.get(bot.id);
  if (lastCallAt && now - lastCallAt < cooldownMs) {
    return `Please wait a few seconds between outbound calls.`;
  }

  const hourAgo = now - 60 * 60 * 1000;
  const recent = (callTimestampsByBot.get(bot.id) || []).filter(ts => ts > hourAgo);
  if (recent.length >= hourlyCap) {
    return `This receptionist has reached its limit of ${hourlyCap} outbound calls per hour.`;
  }

  recent.push(now);
  callTimestampsByBot.set(bot.id, recent);
  lastCallAtByBot.set(bot.id, now);
  return null;
}

export async function updateOutboundRateLimit(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  const cooldownSeconds = Number(req.body?.cooldownSeconds);
  const hourlyCap = Number(req.body?.hourlyCap);
  if (!Number.isFinite(cooldownSeconds) || cooldownSeconds < 0 || cooldownSeconds > MAX_OUTBOUND_COOLDOWN_SECONDS) {
    res.status(400).json({ error: `cooldownSeconds must be between 0 and ${MAX_OUTBOUND_COOLDOWN_SECONDS}` });
    return;
  }
  if (!Number.isFinite(hourlyCap) || hourlyCap < 1 || hourlyCap > MAX_OUTBOUND_HOURLY_CAP) {
    res.status(400).json({ error: `hourlyCap must be between 1 and ${MAX_OUTBOUND_HOURLY_CAP}` });
    return;
  }

  const { error } = await supabase
    .from('bots')
    .update({ dograh_outbound_cooldown_seconds: Math.round(cooldownSeconds), dograh_outbound_hourly_cap: Math.round(hourlyCap) })
    .eq('id', botId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ outboundCooldownSeconds: Math.round(cooldownSeconds), outboundHourlyCap: Math.round(hourlyCap) });
}

// The inbound limit itself is enforced over in phoneToolsController.ts's preCall handler (Dograh
// calls that, not this server, before an inbound call connects - see the comment there for why).
// This endpoint only persists the owner's chosen thresholds; reuses the same bounds as outbound.
export async function updateInboundRateLimit(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  const cooldownSeconds = Number(req.body?.cooldownSeconds);
  const hourlyCap = Number(req.body?.hourlyCap);
  if (!Number.isFinite(cooldownSeconds) || cooldownSeconds < 0 || cooldownSeconds > MAX_OUTBOUND_COOLDOWN_SECONDS) {
    res.status(400).json({ error: `cooldownSeconds must be between 0 and ${MAX_OUTBOUND_COOLDOWN_SECONDS}` });
    return;
  }
  if (!Number.isFinite(hourlyCap) || hourlyCap < 1 || hourlyCap > MAX_OUTBOUND_HOURLY_CAP) {
    res.status(400).json({ error: `hourlyCap must be between 1 and ${MAX_OUTBOUND_HOURLY_CAP}` });
    return;
  }

  const { error } = await supabase
    .from('bots')
    .update({ dograh_inbound_cooldown_seconds: Math.round(cooldownSeconds), dograh_inbound_hourly_cap: Math.round(hourlyCap) })
    .eq('id', botId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ inboundCooldownSeconds: Math.round(cooldownSeconds), inboundHourlyCap: Math.round(hourlyCap) });
}

export async function callOut(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const { phoneNumber } = req.body || {};

  const validation = validateContactInput('phone', String(phoneNumber || ''));
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }
  if (!bot.dograh_outbound_workflow_id) {
    res.status(400).json({ error: 'Provision the phone agent before placing outbound calls' });
    return;
  }
  if (!bot.dograh_telephony_config_id || !bot.dograh_phone_number_id) {
    res.status(400).json({ error: 'Assign a phone number to this receptionist before placing outbound calls' });
    return;
  }

  const rateLimitError = checkOutboundRateLimit(bot);
  if (rateLimitError) {
    res.status(429).json({ error: rateLimitError });
    return;
  }

  try {
    const callContext = {
      botId,
      workflowId: bot.dograh_outbound_workflow_id,
      telephonyConfigId: bot.dograh_telephony_config_id,
      fromPhoneNumberId: bot.dograh_phone_number_id,
      toPhoneNumber: maskPhoneNumber(validation.normalized),
    };
    console.log('[phone-calls] Initiating Dograh outbound call:', callContext);

    const dograhResponse = await initiateCall({
      workflowId: bot.dograh_outbound_workflow_id,
      phoneNumber: validation.normalized,
      telephonyConfigId: bot.dograh_telephony_config_id,
      fromPhoneNumberId: bot.dograh_phone_number_id,
    });
    console.log('[phone-calls] Dograh outbound call accepted:', {
      ...callContext,
      dograhResponse,
    });
    res.json({ success: true, dograhResponse });
  } catch (err: any) {
    console.error('[phone-calls] Outbound call failed:', err);
    res.status(502).json({ error: err.message || 'Failed to place the outbound call' });
  }
}

export async function syncCalls(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  try {
    const result = await syncBotCalls(bot, supabase);
    res.json(result);
  } catch (err: any) {
    console.error('[phone-calls] Manual sync failed:', err);
    res.status(502).json({ error: err.message || 'Failed to sync calls from Dograh' });
  }
}
