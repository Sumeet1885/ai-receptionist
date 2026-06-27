import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { supabase } from '../../services/db';
import { mergeWidgetConfig } from '../../utils/widgetConfig';
import { validateContactInput } from '../../utils/contactValidation';
import { buildDograhOutboundInstruction, buildDograhPhoneInstruction, withoutAutoKnownPhoneField } from './receptionistInstruction';
import { syncBotCalls } from './callMirror';
import {
  assignInboundWorkflow,
  createWorkflowFromDefinition,
  initiateCall,
  listPhoneNumbers,
  listTelephonyConfigs,
  publishWorkflow,
  updateWorkflowInPlace,
} from './dograhClient';
import { DograhProvisionableBot } from './types';
import { buildLeadExtractionVariables, buildSingleNodeWorkflowDefinition } from './workflowDefinition';

// Dograh has no per-bot timezone input on a phone call (no browser to read it from), so the
// phone persona uses a fixed default. Matches the IST-leaning default used elsewhere in the app.
const PHONE_DEFAULT_TIMEZONE = 'Asia/Kolkata';

function maskPhoneNumber(phoneNumber: string): string {
  if (phoneNumber.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, phoneNumber.length - 4))}${phoneNumber.slice(-4)}`;
}

async function loadOwnedBot(botId: string, ownerId: string): Promise<DograhProvisionableBot | null> {
  const { data, error } = await supabase
    .from('bots')
    .select('id, owner_id, business_name, industry, knowledge_base, widget_config, primary_color, dograh_workflow_id, dograh_outbound_workflow_id, dograh_telephony_config_id, dograh_phone_number_id, dograh_phone_number')
    .eq('id', botId)
    .eq('owner_id', ownerId)
    .single();

  if (error || !data) return null;
  return data;
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

    // One click provisions both directions: the inbound (answering) agent and the outbound
    // (calling-out) agent. They are always provisioned together, which keeps the poller's
    // "has a workflow" eligibility check simple — see callPoller.ts. Each is a hand-authored
    // single-conversation-node graph (workflowDefinition.ts), not Dograh's AI-generated
    // create/template graph — see "Phone calls/README.md" for why.
    const inboundInstruction = buildDograhPhoneInstruction(bot, widgetConfig, { timezone: PHONE_DEFAULT_TIMEZONE });
    const inboundDefinition = buildSingleNodeWorkflowDefinition({
      personaPrompt: inboundInstruction,
      extractionVariables,
      isOutbound: false,
      businessName: bot.business_name,
    });
    const inboundWorkflow = bot.dograh_workflow_id
      ? await updateWorkflowInPlace(bot.dograh_workflow_id, inboundDefinition)
      : await createWorkflowFromDefinition(`AI receptionist for ${bot.business_name}`, inboundDefinition);
    await publishWorkflow(inboundWorkflow.id);

    const outboundInstruction = buildDograhOutboundInstruction(bot, widgetConfig, { timezone: PHONE_DEFAULT_TIMEZONE });
    const outboundDefinition = buildSingleNodeWorkflowDefinition({
      personaPrompt: outboundInstruction,
      extractionVariables,
      isOutbound: true,
      businessName: bot.business_name,
    });
    const outboundWorkflow = bot.dograh_outbound_workflow_id
      ? await updateWorkflowInPlace(bot.dograh_outbound_workflow_id, outboundDefinition)
      : await createWorkflowFromDefinition(`AI outbound caller for ${bot.business_name}`, outboundDefinition);
    await publishWorkflow(outboundWorkflow.id);

    const { error } = await supabase
      .from('bots')
      .update({
        dograh_workflow_id: String(inboundWorkflow.id),
        dograh_outbound_workflow_id: String(outboundWorkflow.id),
      })
      .eq('id', botId);
    if (error) throw error;

    res.json({
      dograhWorkflowId: String(inboundWorkflow.id),
      dograhOutboundWorkflowId: String(outboundWorkflow.id),
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
    const number = await assignInboundWorkflow(telephonyConfigId, phoneNumberId, bot.dograh_workflow_id);

    const { error } = await supabase
      .from('bots')
      .update({
        dograh_telephony_config_id: String(telephonyConfigId),
        dograh_phone_number_id: String(phoneNumberId),
        dograh_phone_number: number.address,
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
