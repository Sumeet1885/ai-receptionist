import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { supabase } from '../../services/db';
import { config } from '../../config';
import { mergeWidgetConfig } from '../../utils/widgetConfig';
import { validateContactInput } from '../../utils/contactValidation';
import { buildDograhOutboundInstruction, buildDograhPhoneInstruction, withoutAutoKnownPhoneField } from './receptionistInstruction';
import { syncBotCalls } from './callMirror';
import { registerOutboundCall } from './outboundTracker';
import {
  assignInboundWorkflow,
  unassignInboundWorkflow,
  createEndCallTool,
  createHttpTool,
  createPhoneNumber,
  createTelephonyConfig,
  createWorkflowFromDefinition,
  initiateCall,
  listPhoneNumbers,
  listTelephonyConfigs,
  publishWorkflow,
  updateEndCallTool,
  updateHttpTool,
  updateWorkflowInPlace,
  DograhApiError,
} from './dograhClient';
import { DograhProvisionableBot, ConnectedPhoneLine } from './types';
import { buildCapacityWorkflowDefinition, buildLeadExtractionVariables, buildSingleNodeWorkflowDefinition, MAX_CALL_DURATION_SECONDS } from './workflowDefinition';
import { syncInboundRateLimitWorkflow } from './inboundRateLimiter';
import { logger } from '../../services/cloudwatchLogger';



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

export function extractConnectedLines(bot: DograhProvisionableBot): ConnectedPhoneLine[] {
  const widgetConfig = (bot as any).widget_config || {};
  let lines: ConnectedPhoneLine[] = Array.isArray(widgetConfig.connectedLines)
    ? [...widgetConfig.connectedLines]
    : [];

  const primaryInboundNumber = bot.dograh_phone_number || (bot as any).phone_number || widgetConfig.phoneNumber || null;
  const telephony = widgetConfig.telephony || null;
  const outboundTelephony = widgetConfig.outboundTelephony || null;
  const primaryOutboundNumber = outboundTelephony?.phoneNumber || null;
  const forwardingNumber = widgetConfig.forwardingPhoneNumber || (telephony?.provider === 'forwarding' ? telephony.phoneNumber : null);

  // 1. If primaryInboundNumber exists and is not just a forwarding number:
  if (primaryInboundNumber && telephony?.provider !== 'forwarding') {
    const existingInbound = lines.find(l => l.phoneNumber === primaryInboundNumber && (l.type === 'inbound' || l.type === 'both'));
    if (!existingInbound) {
      lines.unshift({
        id: `line_in_${primaryInboundNumber.replace(/\D/g, '') || 'primary'}`,
        phoneNumber: primaryInboundNumber,
        type: (primaryOutboundNumber === primaryInboundNumber || !primaryOutboundNumber) ? 'both' : 'inbound',
        provider: telephony?.provider || 'pool',
        label: telephony?.label || (telephony?.provider === 'pool' ? 'Default Receptionist Line' : `${(telephony?.provider || 'Platform').toUpperCase()} Inbound Line`),
        status: 'active',
        isPrimaryInbound: true,
        isPrimaryOutbound: (primaryOutboundNumber === primaryInboundNumber || !primaryOutboundNumber),
        configuredAt: telephony?.configuredAt || new Date().toISOString(),
        telephonyConfigId: bot.dograh_telephony_config_id || telephony?.telephonyConfigId || null,
        phoneNumberId: bot.dograh_phone_number_id || telephony?.phoneNumberId || null,
        credentials: telephony?.credentials || null,
      });
    } else {
      existingInbound.isPrimaryInbound = true;
      if (primaryOutboundNumber === primaryInboundNumber || !primaryOutboundNumber) {
        existingInbound.isPrimaryOutbound = true;
      }
    }
  }

  // 2. If outboundTelephony has a separate number:
  if (primaryOutboundNumber && primaryOutboundNumber !== primaryInboundNumber) {
    const existingOutbound = lines.find(l => l.phoneNumber === primaryOutboundNumber && (l.type === 'outbound' || l.type === 'both'));
    if (!existingOutbound) {
      lines.push({
        id: `line_out_${primaryOutboundNumber.replace(/\D/g, '') || 'dedicated'}`,
        phoneNumber: primaryOutboundNumber,
        type: 'outbound',
        provider: outboundTelephony?.provider || 'pool',
        label: outboundTelephony?.label || `${(outboundTelephony?.provider || 'Dedicated').toUpperCase()} Outbound Line`,
        status: 'active',
        isPrimaryInbound: false,
        isPrimaryOutbound: true,
        configuredAt: outboundTelephony?.configuredAt || new Date().toISOString(),
        telephonyConfigId: outboundTelephony?.telephonyConfigId || null,
        phoneNumberId: outboundTelephony?.phoneNumberId || null,
      });
    } else {
      existingOutbound.isPrimaryOutbound = true;
    }
  }

  // 3. If forwardingNumber exists:
  if (forwardingNumber) {
    const existingFwd = lines.find(l => l.phoneNumber === forwardingNumber && l.type === 'forwarding');
    if (!existingFwd) {
      lines.push({
        id: `line_fwd_${forwardingNumber.replace(/\D/g, '') || 'sim'}`,
        phoneNumber: forwardingNumber,
        type: 'forwarding',
        provider: 'forwarding',
        label: 'Carrier Call Forwarding (Mobile SIM)',
        status: 'active',
        configuredAt: new Date().toISOString(),
      });
    }
  }

  // Deduplicate lines by (phoneNumber + type)
  const uniqueLines: ConnectedPhoneLine[] = [];
  const seenKeys = new Set<string>();
  for (const line of lines) {
    const key = `${line.phoneNumber}:${line.type}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueLines.push(line);
    }
  }

  return uniqueLines;
}

async function isCalendarConnected(ownerId: string): Promise<boolean> {
  const { data } = await supabase.from('calendar_connections').select('provider').eq('owner_id', ownerId).maybeSingle();
  return Boolean(data?.provider);
}

interface PhoneToolUuids {
  checkAvailabilityToolUuid: string;
  bookAppointmentToolUuid: string;
}

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
      { name: 'title', type: 'string' as const, description: 'Title of the appointment (optional)', required: false },
      { name: 'visitorName', type: 'string' as const, description: 'Caller full name', required: false },
      { name: 'visitorPhone', type: 'string' as const, description: 'Caller phone number', required: false },
      { name: 'visitorEmail', type: 'string' as const, description: 'Caller email address', required: false },
      { name: 'startTime', type: 'string' as const, description: 'Start time in ISO 8601 format (e.g. 2026-10-06T15:00:00+05:30)', required: true },
      { name: 'endTime', type: 'string' as const, description: 'End time in ISO 8601 format (optional, defaults to 30 min duration)', required: false },
    ],
  };

  let checkAvailabilityToolUuid = bot.dograh_check_availability_tool_uuid;
  if (checkAvailabilityToolUuid) {
    try {
      await updateHttpTool(checkAvailabilityToolUuid, checkAvailabilityParams);
    } catch (err: any) {
      if (err instanceof DograhApiError && err.status === 404) {
        checkAvailabilityToolUuid = (await createHttpTool(checkAvailabilityParams)).tool_uuid;
      } else {
        throw err;
      }
    }
  } else {
    checkAvailabilityToolUuid = (await createHttpTool(checkAvailabilityParams)).tool_uuid;
  }

  let bookAppointmentToolUuid = bot.dograh_book_appointment_tool_uuid;
  if (bookAppointmentToolUuid) {
    try {
      await updateHttpTool(bookAppointmentToolUuid, bookAppointmentParams);
    } catch (err: any) {
      if (err instanceof DograhApiError && err.status === 404) {
        bookAppointmentToolUuid = (await createHttpTool(bookAppointmentParams)).tool_uuid;
      } else {
        throw err;
      }
    }
  } else {
    bookAppointmentToolUuid = (await createHttpTool(bookAppointmentParams)).tool_uuid;
  }

  return { checkAvailabilityToolUuid, bookAppointmentToolUuid };
}


async function ensureCallTimeTool(bot: DograhProvisionableBot): Promise<string> {
  const params = {
    name: `Check Call Time Remaining - ${bot.business_name}`,
    description: 'Check how much time is left on this call before it should wrap up. Call this periodically, more often as the call goes on, to know when to start closing the conversation.',
    url: `${config.phoneTools.callbackBaseUrl}/api/phone-tools/${bot.id}/call-time-remaining`,
    method: 'POST' as const,
    headers: { 'X-API-Key': config.phoneTools.apiKey },
  };

  if (bot.dograh_call_time_tool_uuid) {
    try {
      await updateHttpTool(bot.dograh_call_time_tool_uuid, params);
      return bot.dograh_call_time_tool_uuid;
    } catch (err: any) {
      if (err instanceof DograhApiError && err.status === 404) {
        return (await createHttpTool(params)).tool_uuid;
      }
      throw err;
    }
  }
  return (await createHttpTool(params)).tool_uuid;
}


async function ensureRateLimitTool(bot: DograhProvisionableBot): Promise<string> {
  const params = {
    name: `Capacity Hangup - ${bot.business_name}`,
    description: 'Call this immediately when this inbound number is at capacity. End the call silently; say nothing.',
  };

  if (bot.dograh_rate_limit_tool_uuid) {
    try {
      await updateEndCallTool(bot.dograh_rate_limit_tool_uuid, params);
      return bot.dograh_rate_limit_tool_uuid;
    } catch (err: any) {
      if (err instanceof DograhApiError && err.status === 404) {
        return (await createEndCallTool(params)).tool_uuid;
      }
      throw err;
    }
  }
  return (await createEndCallTool(params)).tool_uuid;
}

async function ensureCapacityWorkflow(bot: DograhProvisionableBot, endCallToolUuid: string) {
  const definition = buildCapacityWorkflowDefinition(endCallToolUuid);
  let workflow;
  if (bot.dograh_capacity_workflow_id) {
    try {
      workflow = await updateWorkflowInPlace(bot.dograh_capacity_workflow_id, definition, CAPACITY_WORKFLOW_CONFIGURATIONS);
    } catch (err: any) {
      if (err instanceof DograhApiError && err.status === 404) {
        workflow = await createWorkflowFromDefinition(`AI receptionist capacity hangup for ${bot.business_name}`, definition, CAPACITY_WORKFLOW_CONFIGURATIONS);
      } else {
        throw err;
      }
    }
  } else {
    workflow = await createWorkflowFromDefinition(`AI receptionist capacity hangup for ${bot.business_name}`, definition, CAPACITY_WORKFLOW_CONFIGURATIONS);
  }
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

  const widgetConfig = (bot as any).widget_config || {};
  const telephony = widgetConfig.telephony || null;
  const outboundTelephony = widgetConfig.outboundTelephony || null;
  const inboundWebhookUrl = `${config.dograh.apiUrl}/api/v1/telephony/inbound/run`;
  const connectedLines = extractConnectedLines(bot);

  const hasCalendar = widgetConfig.enableCalendar && (await isCalendarConnected(bot.owner_id));

  res.json({
    provisioned: Boolean(bot.dograh_workflow_id),
    outboundProvisioned: Boolean(bot.dograh_outbound_workflow_id),
    phoneNumber: bot.dograh_phone_number || (bot as any).phone_number || null,
    outboundPhoneNumber: outboundTelephony?.phoneNumber || bot.dograh_phone_number || (bot as any).phone_number || null,
    inboundActiveWorkflow: bot.dograh_inbound_active_workflow || 'normal',
    inboundRateLimitedUntil: bot.dograh_inbound_rate_limited_until || null,
    outboundCooldownSeconds: bot.dograh_outbound_cooldown_seconds ?? 10,
    outboundHourlyCap: bot.dograh_outbound_hourly_cap ?? 20,
    inboundCooldownSeconds: bot.dograh_inbound_cooldown_seconds ?? 10,
    inboundHourlyCap: bot.dograh_inbound_hourly_cap ?? 20,
    telephony,
    outboundTelephony,
    connectedLines,
    inboundWebhookUrl,
    defaultPlatformNumber: config.defaultPhoneNumber || null,
    calendarConnected: Boolean(hasCalendar),
    calendarMode: hasCalendar ? 'live_booking' : 'sales_callback',
  });
}

export async function provisionBot(req: AuthRequest, res: Response): Promise<void> {
  try {
    const botId = req.params.botId;
    const bot = await loadOwnedBot(botId, req.user!.id);
    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    const widgetConfig = mergeWidgetConfig((bot as any).widget_config, bot);
    const extractionVariables = buildLeadExtractionVariables(withoutAutoKnownPhoneField(widgetConfig));
    const callTimeToolUuid = await ensureCallTimeTool(bot);
    const rateLimitToolUuid = await ensureRateLimitTool(bot);

    // Verify if callback URL is actively reachable from the public internet.
    // If ngrok / local tunnel is inactive, avoid passing pre_call_fetch_url so Dograh does not
    // stall for 5-8 seconds on call pickup waiting for an unresponsive callback URL.
    const callbackUrl = (config.phoneTools.callbackBaseUrl || '').trim();
    let isCallbackLive = false;
    if (callbackUrl && !callbackUrl.includes('localhost') && !callbackUrl.includes('host.docker.internal')) {
      try {
        const ping = await fetch(callbackUrl, { signal: AbortSignal.timeout(2000) });
        if (ping.status < 500 && ping.status !== 404) {
          isCallbackLive = true;
        }
      } catch {
        isCallbackLive = false;
      }
    }

    const preCallFetchBase = isCallbackLive
      ? `${callbackUrl}/api/phone-tools/${botId}/pre-call?key=${config.phoneTools.apiKey}`
      : '';
    const inboundPreCallFetchUrl = preCallFetchBase ? `${preCallFetchBase}&direction=inbound` : '';
    const outboundPreCallFetchUrl = preCallFetchBase ? `${preCallFetchBase}&direction=outbound` : '';

    const useTools = isCallbackLive && widgetConfig.enableCalendar && (await isCalendarConnected(bot.owner_id));
    logger.aiReceptionist('Provisioning AI Receptionist started', {
      botId,
      businessName: bot.business_name,
      ownerId: req.user!.id,
      useTools,
      isCallbackLive,
    });
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

    const inboundInstruction = buildDograhPhoneInstruction(bot, widgetConfig, { timezone: PHONE_DEFAULT_TIMEZONE, useToolBasedBooking: useTools });
    const inboundDefinition = buildSingleNodeWorkflowDefinition({
      personaPrompt: inboundInstruction,
      extractionVariables,
      isOutbound: false,
      businessName: bot.business_name,
      toolUuids,
      preCallFetchUrl: inboundPreCallFetchUrl,
      useToolBasedBooking: useTools,
    });

    let inboundWorkflow;
    if (bot.dograh_workflow_id) {
      try {
        inboundWorkflow = await updateWorkflowInPlace(bot.dograh_workflow_id, inboundDefinition, WORKFLOW_CONFIGURATIONS);
      } catch (err: any) {
        if (err instanceof DograhApiError && err.status === 404) {
          inboundWorkflow = await createWorkflowFromDefinition(`AI receptionist for ${bot.business_name}`, inboundDefinition, WORKFLOW_CONFIGURATIONS);
        } else {
          throw err;
        }
      }
    } else {
      inboundWorkflow = await createWorkflowFromDefinition(`AI receptionist for ${bot.business_name}`, inboundDefinition, WORKFLOW_CONFIGURATIONS);
    }
    await publishWorkflow(inboundWorkflow.id);

    const outboundInstruction = buildDograhOutboundInstruction(bot, widgetConfig, { timezone: PHONE_DEFAULT_TIMEZONE, useToolBasedBooking: useTools });
    const outboundDefinition = buildSingleNodeWorkflowDefinition({
      personaPrompt: outboundInstruction,
      extractionVariables,
      isOutbound: true,
      businessName: bot.business_name,
      toolUuids,
      preCallFetchUrl: outboundPreCallFetchUrl,
      useToolBasedBooking: useTools,
    });
    let outboundWorkflow;
    if (bot.dograh_outbound_workflow_id) {
      try {
        outboundWorkflow = await updateWorkflowInPlace(bot.dograh_outbound_workflow_id, outboundDefinition, WORKFLOW_CONFIGURATIONS);
      } catch (err: any) {
        if (err instanceof DograhApiError && err.status === 404) {
          outboundWorkflow = await createWorkflowFromDefinition(`AI outbound caller for ${bot.business_name}`, outboundDefinition, WORKFLOW_CONFIGURATIONS);
        } else {
          throw err;
        }
      }
    } else {
      outboundWorkflow = await createWorkflowFromDefinition(`AI outbound caller for ${bot.business_name}`, outboundDefinition, WORKFLOW_CONFIGURATIONS);
    }
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
    if (error) {
      console.error('[phone-calls] Error updating bot after provisioning:', error);
      res.status(500).json({ error: error.message || 'Database update failed after provisioning' });
      return;
    }

    logger.aiReceptionist('Provisioning AI Receptionist completed successfully', {
      botId,
      businessName: bot.business_name,
      inboundWorkflowId: String(inboundWorkflow.id),
      outboundWorkflowId: String(outboundWorkflow.id),
      capacityWorkflowId: String(capacityWorkflow.id),
    });

    res.json({
      dograhWorkflowId: String(inboundWorkflow.id),
      dograhOutboundWorkflowId: String(outboundWorkflow.id),
      dograhCapacityWorkflowId: String(capacityWorkflow.id),
    });
  } catch (err: any) {
    const errorMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
    console.error('[phone-calls] Provisioning failed:', errorMsg);
    logger.aiReceptionist('Provisioning AI Receptionist failed', {
      botId: req.params.botId,
      error: errorMsg,
    }, 'error');
    res.status(502).json({ error: errorMsg || 'Failed to provision the Dograh phone agent' });
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
    const { data: claimedRows } = await supabase
      .from('bots')
      .select('id, dograh_phone_number_id')
      .not('dograh_phone_number_id', 'is', null);
    const claimedByOtherBot = new Set(
      (claimedRows || [])
        .filter((row: any) => row.id !== botId)
        .map((row: any) => row.dograh_phone_number_id)
    );

    const numbers = [];
    try {
      const configs = await listTelephonyConfigs();
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
    } catch (err: any) {
      console.warn('[phone-calls] External telephony provider not reachable; returning empty numbers pool:', err?.message);
    }

    // Include the default platform number provided by us
    const defaultNumber = config.defaultPhoneNumber;
    if (defaultNumber) {
      const alreadyIncluded = numbers.some(n => n.address === defaultNumber);
      if (!alreadyIncluded) {
        numbers.unshift({
          telephonyConfigId: 999999,
          telephonyConfigName: 'Default Platform Line (Instant)',
          phoneNumberId: 999999,
          address: defaultNumber,
          label: 'Default AI Receptionist Line',
          isAssignedToThisBot: bot?.dograh_phone_number === defaultNumber || (bot as any)?.phone_number === defaultNumber,
        });
      }
    }

    res.json({ numbers });
  } catch (err: any) {
    console.error('[phone-calls] Listing numbers failed:', err);
    res.json({ numbers: [] });
  }
}

export async function assignNumber(req: AuthRequest, res: Response): Promise<void> {
  try {
    const botId = req.params.botId;
    const {
      telephonyConfigId,
      phoneNumberId,
      customPhoneNumber,
      provider,
      credentials,
      label,
    } = req.body || {};

    const bot = await loadOwnedBot(botId, req.user!.id);
    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    // Handle Bring Your Own (BYO) custom number or provider
    if (customPhoneNumber) {
      const rawNumber = String(customPhoneNumber).trim();
      let normalized = rawNumber;

      if (provider === 'asterisk' || provider === 'ari') {
        if (!rawNumber || /[\s,&]/.test(rawNumber)) {
          res.status(400).json({ error: 'SIP extension/number cannot be empty or contain spaces, commas, or ampersands' });
          return;
        }
      } else {
        const validation = validateContactInput('phone', rawNumber);
        if (!validation.valid || !validation.normalized) {
          res.status(400).json({ error: validation.error || 'Please provide a valid phone number with country code' });
          return;
        }
        normalized = validation.normalized;
      }

      let stasisAppName: string | null = credentials?.stasisAppName || null;
      let matchedConfigId: number | null = null;
      let matchedNumberId: number | null = null;

      // Validate provider specific required fields if provider is specified
      if (provider === 'asterisk' || provider === 'ari') {
        const ariEndpoint = credentials?.ariEndpoint?.trim();
        const appName = credentials?.appName?.trim();
        const appPassword = credentials?.appPassword?.trim();
        const wsClientName = credentials?.wsClientName?.trim();

        if (!ariEndpoint) {
          res.status(400).json({ error: 'ARI base URL is required (e.g., http://asterisk.example.com:8088)' });
          return;
        }
        if (!appName) {
          res.status(400).json({ error: 'ARI username is required (matching section name in ari.conf)' });
          return;
        }
        if (!appPassword && !credentials?.hasSecret) {
          res.status(400).json({ error: 'ARI App Password is required' });
          return;
        }
        if (!wsClientName) {
          res.status(400).json({ error: 'websocket_client.conf connection name for externalMedia is required' });
          return;
        }

        // Create the configuration directly in Dograh backend
        try {
          const configName = label?.trim() || `Asterisk ARI (${appName})`;
          const createdConfig = await createTelephonyConfig({
            name: configName,
            is_default_outbound: Boolean(credentials?.isDefaultOutbound),
            config: {
              provider: 'ari',
              ari_endpoint: ariEndpoint,
              app_name: appName,
              app_password: appPassword,
              ws_client_name: wsClientName,
              dial_string_template: credentials?.dialStringTemplate?.trim() || 'PJSIP/{number}',
            },
          });
          matchedConfigId = createdConfig.id;
          stasisAppName = (createdConfig.credentials as any)?.stasis_app_name || (createdConfig as any).stasisAppName || `dograh_${createdConfig.id}`;

          // Register SIP extension / phone number under this configuration in Dograh
          try {
            const numRes = await createPhoneNumber(createdConfig.id, {
              address: normalized,
              inbound_workflow_id: bot.dograh_workflow_id ? Number(bot.dograh_workflow_id) : undefined,
              is_active: true,
              is_default_caller_id: true,
            });
            matchedNumberId = numRes.id;
          } catch (numErr: any) {
            console.warn('[phone-calls] Could not register extension under Dograh ARI configuration:', numErr?.message);
          }
        } catch (err: any) {
          console.warn('[phone-calls] Dograh createTelephonyConfig for ARI returned error:', err?.message);
          if (!stasisAppName) {
            stasisAppName = `dograh_${botId.replace(/-/g, '').slice(0, 10)}`;
          }
        }
      } else if (provider === 'twilio') {
        const sid = credentials?.accountSid?.trim();
        const token = credentials?.authToken?.trim();
        if (!sid) {
          res.status(400).json({ error: 'Twilio Account SID is required (starts with AC...)' });
          return;
        }
        if (!token && !credentials?.hasSecret) {
          res.status(400).json({ error: 'Twilio Auth Token is required' });
          return;
        }

        // Auto-provision Twilio configuration directly in Dograh backend
        if (sid && token) {
          try {
            const configName = label?.trim() || `Twilio (${maskPhoneNumber(normalized)})`;
            const createdConfig = await createTelephonyConfig({
              name: configName,
              is_default_outbound: true,
              config: {
                provider: 'twilio',
                account_sid: sid,
                auth_token: token,
              },
            });
            matchedConfigId = createdConfig.id;

            try {
              const numRes = await createPhoneNumber(createdConfig.id, {
                address: normalized,
                inbound_workflow_id: bot.dograh_workflow_id ? Number(bot.dograh_workflow_id) : undefined,
                is_active: true,
                is_default_caller_id: true,
              });
              matchedNumberId = numRes.id;
            } catch (numErr: any) {
              console.warn('[phone-calls] Could not register phone number under Dograh Twilio configuration:', numErr?.message);
            }
          } catch (err: any) {
            console.warn('[phone-calls] Dograh createTelephonyConfig for Twilio returned error:', err?.message);
          }
        }
      } else if (provider === 'plivo') {
        const authId = credentials?.authId?.trim();
        const authToken = credentials?.authToken?.trim();
        if (!authId) {
          res.status(400).json({ error: 'Plivo Auth ID is required' });
          return;
        }
        if (!authToken && !credentials?.hasSecret) {
          res.status(400).json({ error: 'Plivo Auth Token is required' });
          return;
        }

        // Auto-provision Plivo configuration directly in Dograh backend
        if (authId && authToken) {
          try {
            const configName = label?.trim() || `Plivo (${maskPhoneNumber(normalized)})`;
            const createdConfig = await createTelephonyConfig({
              name: configName,
              is_default_outbound: true,
              config: {
                provider: 'plivo',
                auth_id: authId,
                auth_token: authToken,
                app_id: credentials?.appId?.trim() || undefined,
              },
            });
            matchedConfigId = createdConfig.id;

            try {
              const numRes = await createPhoneNumber(createdConfig.id, {
                address: normalized,
                inbound_workflow_id: bot.dograh_workflow_id ? Number(bot.dograh_workflow_id) : undefined,
                is_active: true,
                is_default_caller_id: true,
              });
              matchedNumberId = numRes.id;
            } catch (numErr: any) {
              console.warn('[phone-calls] Could not register phone number under Dograh Plivo configuration:', numErr?.message);
            }
          } catch (err: any) {
            console.warn('[phone-calls] Dograh createTelephonyConfig for Plivo returned error:', err?.message);
          }
        }
      } else if (provider === 'vonage') {
        const apiKey = credentials?.apiKey?.trim();
        const apiSecret = credentials?.apiSecret?.trim();
        if (!apiKey || (!apiSecret && !credentials?.hasSecret)) {
          res.status(400).json({ error: 'Vonage API Key and API Secret are required' });
          return;
        }
      } else if (provider === 'telnyx') {
        const apiKey = credentials?.apiKey?.trim();
        if (!apiKey) {
          res.status(400).json({ error: 'Telnyx API Key is required' });
          return;
        }
      }

      // Check if another bot already has this number assigned
      const { data: claimant } = await supabase
        .from('bots')
        .select('id')
        .eq('dograh_phone_number', normalized)
        .neq('id', botId)
        .maybeSingle();

      if (claimant) {
        res.status(409).json({ error: 'This phone number is already configured for another receptionist' });
        return;
      }

      // Check if this number exists in any Dograh telephony configurations (best effort if bot is provisioned)
      if (provider !== 'asterisk' && provider !== 'ari' && bot.dograh_workflow_id) {
        try {
          const configs = await listTelephonyConfigs();
          for (const tc of configs) {
            const phoneNumbers = await listPhoneNumbers(tc.id);
            const match = phoneNumbers.find(
              n => n.address === normalized || n.address.replace(/\D/g, '') === normalized.replace(/\D/g, '')
            );
            if (match) {
              matchedConfigId = tc.id;
              matchedNumberId = match.id;
              break;
            }
          }
        } catch {
          // Telephony configs check is best-effort for BYO numbers
        }

        if (matchedConfigId && matchedNumberId) {
          try {
            await assignInboundWorkflow(matchedConfigId, matchedNumberId, bot.dograh_workflow_id);
          } catch (err: any) {
            console.warn('[phone-calls] Could not bind matched Dograh workflow for custom number:', err?.message);
          }
        }
      }

      if (provider === 'forwarding') {
        const existingWidgetConfig = (bot as any).widget_config || {};
        let currentLines = extractConnectedLines(bot);
        const existingIndex = currentLines.findIndex(l => l.phoneNumber === normalized && l.type === 'forwarding');
        if (existingIndex >= 0) {
          currentLines[existingIndex].status = 'active';
          currentLines[existingIndex].label = label || currentLines[existingIndex].label;
        } else {
          currentLines.push({
            id: `line_fwd_${Date.now()}`,
            phoneNumber: normalized,
            type: 'forwarding',
            provider: 'forwarding',
            label: label || 'Carrier Call Forwarding (Mobile SIM)',
            status: 'active',
            configuredAt: new Date().toISOString(),
          });
        }

        const { error } = await supabase
          .from('bots')
          .update({
            widget_config: {
              ...existingWidgetConfig,
              forwardingPhoneNumber: normalized,
              connectedLines: currentLines,
            },
          })
          .eq('id', botId);

        if (error) {
          res.status(500).json({ error: error.message || 'Failed to save forwarding number' });
          return;
        }

        logger.aiReceptionist('Forwarding phone number configured', {
          botId,
          phoneNumber: maskPhoneNumber(normalized),
        });

        res.json({
          phoneNumber: normalized,
          provider: 'forwarding',
          status: 'configured',
          connectedLines: currentLines,
          inboundWebhookUrl: `${config.dograh.apiUrl}/api/v1/telephony/inbound/run`,
        });
        return;
      }

      const existingWidgetConfig = (bot as any).widget_config || {};
      const telephonyRecord = {
        provider: provider || 'custom',
        phoneNumber: normalized,
        label: label || credentials?.label || (provider === 'asterisk' ? `Asterisk ARI (${credentials?.appName || 'pbx'})` : null),
        credentials: {
          accountSid: credentials?.accountSid || null,
          authId: credentials?.authId || null,
          appId: credentials?.appId || null,
          apiKey: credentials?.apiKey || null,
          connectionId: credentials?.connectionId || null,
          hasSecret: Boolean(credentials?.authToken || credentials?.apiSecret || credentials?.appPassword),
          ariEndpoint: credentials?.ariEndpoint || null,
          appName: credentials?.appName || null,
          wsClientName: credentials?.wsClientName || null,
          dialStringTemplate: credentials?.dialStringTemplate || 'PJSIP/{number}',
          stasisAppName: stasisAppName || null,
          isDefaultOutbound: Boolean(credentials?.isDefaultOutbound),
        },
        configuredAt: new Date().toISOString(),
        status: 'active',
      };

      let currentLines = extractConnectedLines(bot);
      currentLines.forEach(l => {
        if (l.type === 'inbound' || l.type === 'both') l.isPrimaryInbound = false;
      });
      const existingIndex = currentLines.findIndex(l => l.phoneNumber === normalized && (l.type === 'inbound' || l.type === 'both'));
      if (existingIndex >= 0) {
        currentLines[existingIndex].isPrimaryInbound = true;
        currentLines[existingIndex].status = 'active';
        currentLines[existingIndex].provider = provider || 'custom';
        currentLines[existingIndex].label = label || currentLines[existingIndex].label;
        currentLines[existingIndex].telephonyConfigId = matchedConfigId ? String(matchedConfigId) : currentLines[existingIndex].telephonyConfigId;
        currentLines[existingIndex].phoneNumberId = matchedNumberId ? String(matchedNumberId) : currentLines[existingIndex].phoneNumberId;
      } else {
        currentLines.unshift({
          id: `line_in_${Date.now()}`,
          phoneNumber: normalized,
          type: 'inbound',
          provider: provider || 'custom',
          label: label || `${(provider || 'Custom').toUpperCase()} Inbound Line`,
          status: 'active',
          isPrimaryInbound: true,
          configuredAt: new Date().toISOString(),
          telephonyConfigId: matchedConfigId ? String(matchedConfigId) : null,
          phoneNumberId: matchedNumberId ? String(matchedNumberId) : null,
          credentials: telephonyRecord.credentials,
        });
      }

      const { error } = await supabase
        .from('bots')
        .update({
          dograh_telephony_config_id: matchedConfigId ? String(matchedConfigId) : null,
          dograh_phone_number_id: matchedNumberId ? String(matchedNumberId) : null,
          dograh_phone_number: normalized,
          dograh_inbound_active_workflow: 'normal',
          widget_config: {
            ...existingWidgetConfig,
            phoneNumber: normalized,
            telephony: telephonyRecord,
            connectedLines: currentLines,
          },
        })
        .eq('id', botId);

      if (error) {
        console.error('[phone-calls] Failed to save custom phone number:', error);
        res.status(500).json({ error: error.message || 'Failed to save phone number' });
        return;
      }

      logger.aiReceptionist('Inbound phone number configured (BYO)', {
        botId,
        phoneNumber: maskPhoneNumber(normalized),
        provider: provider || 'custom',
        matchedConfigId,
        matchedNumberId,
      });

      res.json({
        phoneNumber: normalized,
        provider: provider || 'custom',
        status: 'configured',
        connectedLines: currentLines,
        inboundWebhookUrl: `${config.dograh.apiUrl}/api/v1/telephony/inbound/run`,
        stasisAppName: stasisAppName || null,
        telephonyConfigId: matchedConfigId || null,
      });
      return;
    }

    // Handle selecting from Dograh telephony pool
    if (!telephonyConfigId || !phoneNumberId) {
      res.status(400).json({ error: 'Either customPhoneNumber or both telephonyConfigId and phoneNumberId are required' });
      return;
    }

    // Special handling for the Default Platform Number
    if (telephonyConfigId === 999999 || phoneNumberId === 999999) {
      if (!config.defaultPhoneNumber) {
        res.status(400).json({ error: 'No shared platform pool numbers available right now. Please connect a carrier line or set up call forwarding.' });
        return;
      }
      const defaultNumber = config.defaultPhoneNumber;
      const existingWidgetConfig = (bot as any).widget_config || {};
      const telephonyRecord = {
        provider: 'pool',
        phoneNumber: defaultNumber,
        telephonyConfigId: 999999,
        phoneNumberId: 999999,
        label: 'Default Platform Line',
        configuredAt: new Date().toISOString(),
        status: 'active',
      };

      let currentLines = extractConnectedLines(bot);
      currentLines.forEach(l => {
        if (l.type === 'inbound' || l.type === 'both') l.isPrimaryInbound = false;
      });
      const existingIdx = currentLines.findIndex(l => l.phoneNumber === defaultNumber && (l.type === 'inbound' || l.type === 'both'));
      if (existingIdx >= 0) {
        currentLines[existingIdx].isPrimaryInbound = true;
        currentLines[existingIdx].status = 'active';
      } else {
        currentLines.unshift({
          id: `line_pool_default`,
          phoneNumber: defaultNumber,
          type: 'inbound',
          provider: 'pool',
          label: 'Default Platform Line',
          status: 'active',
          isPrimaryInbound: true,
          configuredAt: new Date().toISOString(),
          telephonyConfigId: '999999',
          phoneNumberId: '999999',
        });
      }

      const { error } = await supabase
        .from('bots')
        .update({
          dograh_telephony_config_id: '999999',
          dograh_phone_number_id: '999999',
          dograh_phone_number: defaultNumber,
          dograh_inbound_active_workflow: 'normal',
          widget_config: {
            ...existingWidgetConfig,
            phoneNumber: defaultNumber,
            telephony: telephonyRecord,
            connectedLines: currentLines,
          },
        })
        .eq('id', botId);

      if (error) {
        console.error('[phone-calls] Error assigning default platform line:', error);
        res.status(500).json({ error: error.message || 'Failed to assign default line' });
        return;
      }

      logger.aiReceptionist('Inbound phone number configured (Platform Default)', {
        botId,
        phoneNumber: maskPhoneNumber(defaultNumber),
      });

      res.json({
        phoneNumber: defaultNumber,
        provider: 'pool',
        status: 'configured',
        connectedLines: currentLines,
      });
      return;
    }

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

      const existingWidgetConfig = (bot as any).widget_config || {};
      const telephonyRecord = {
        provider: 'pool',
        phoneNumber: number.address,
        telephonyConfigId,
        phoneNumberId,
        configuredAt: new Date().toISOString(),
        status: 'active',
      };

      let currentLines = extractConnectedLines(bot);
      currentLines.forEach(l => {
        if (l.type === 'inbound' || l.type === 'both') l.isPrimaryInbound = false;
      });
      const existingIdx = currentLines.findIndex(l => l.phoneNumber === number.address && (l.type === 'inbound' || l.type === 'both'));
      if (existingIdx >= 0) {
        currentLines[existingIdx].isPrimaryInbound = true;
        currentLines[existingIdx].status = 'active';
      } else {
        currentLines.unshift({
          id: `line_pool_${number.id}`,
          phoneNumber: number.address,
          type: 'inbound',
          provider: 'pool',
          label: number.label || 'Assigned Pool Line',
          status: 'active',
          isPrimaryInbound: true,
          configuredAt: new Date().toISOString(),
          telephonyConfigId: String(telephonyConfigId),
          phoneNumberId: String(phoneNumberId),
        });
      }

      const { error } = await supabase
        .from('bots')
        .update({
          dograh_telephony_config_id: String(telephonyConfigId),
          dograh_phone_number_id: String(phoneNumberId),
          dograh_phone_number: number.address,
          dograh_inbound_active_workflow: shouldKeepCapacity ? 'capacity' : 'normal',
          dograh_inbound_rate_limited_until: shouldKeepCapacity ? bot.dograh_inbound_rate_limited_until : null,
          widget_config: {
            ...existingWidgetConfig,
            phoneNumber: number.address,
            telephony: telephonyRecord,
            connectedLines: currentLines,
          },
        })
        .eq('id', botId);
      if (error) {
        console.error('[phone-calls] Failed to save assigned pool number in database:', error);
        res.status(500).json({ error: error.message || 'Failed to update bot with assigned number' });
        return;
      }

      logger.aiReceptionist('Inbound phone number assigned from pool', {
        botId,
        phoneNumber: maskPhoneNumber(number.address),
        telephonyConfigId: String(telephonyConfigId),
        phoneNumberId: String(phoneNumberId),
      });

      res.json({
        phoneNumber: number.address,
        provider: 'pool',
        status: 'configured',
        connectedLines: currentLines,
        inboundWebhookUrl: `${config.dograh.apiUrl}/api/v1/telephony/inbound/run`,
      });
    } catch (err: any) {
      console.error('[phone-calls] Assigning number failed:', err);
      logger.aiReceptionist('Inbound phone number assignment failed', { botId, error: err?.message }, 'error');
      res.status(502).json({ error: err.message || 'Failed to assign the phone number' });
    }
  } catch (err: any) {
    const errorMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
    console.error('[phone-calls] assignNumber unhandled error:', errorMsg);
    logger.aiReceptionist('Inbound phone number assignment failed', { botId: req.params.botId, error: errorMsg }, 'error');
    res.status(500).json({ error: errorMsg || 'Internal error configuring phone number' });
  }
}

export async function unassignNumber(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;

  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  if (!bot.dograh_phone_number_id || !bot.dograh_telephony_config_id) {
    res.status(400).json({ error: 'No phone number is currently assigned to this agent' });
    return;
  }

  try {
    await unassignInboundWorkflow(bot.dograh_telephony_config_id, bot.dograh_phone_number_id);
  } catch (err: any) {
    console.warn(
      `[phone-calls] unassignNumber: Dograh API call failed for bot ${botId} (continuing with DB cleanup):`,
      err.message
    );
  }

  const { error } = await supabase
    .from('bots')
    .update({
      dograh_telephony_config_id: null,
      dograh_phone_number_id: null,
      dograh_phone_number: null,
      dograh_inbound_active_workflow: 'normal',
      dograh_inbound_rate_limited_until: null,
    })
    .eq('id', botId);

  if (error) {
    console.error('[phone-calls] unassignNumber: Supabase update failed:', error);
    res.status(500).json({ error: error.message });
    return;
  }

  console.log(`[phone-calls] Phone number ${bot.dograh_phone_number} unassigned from bot ${botId}`);
  res.json({ success: true });
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
    .select('id, session_id, caller_number, status, duration_seconds, recording_url, transcript_url, started_at, created_at, ingest_status, dograh_workflow_id, cost_info')
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

  const outboundWfId = bot.dograh_outbound_workflow_id ? String(bot.dograh_outbound_workflow_id) : null;

  res.json({
    calls: (calls || []).map(call => {
      const storedDirection = (call.cost_info as any)?.direction;
      const isOutbound =
        storedDirection === 'outbound' ||
        Boolean(outboundWfId && call.dograh_workflow_id === outboundWfId);
      return {
        ...call,
        direction: isOutbound ? 'outbound' : 'inbound',
        lead: call.session_id ? leadsBySession.get(call.session_id) || null : null,
      };
    }),
  });
}

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

  logger.aiReceptionist('Outbound rate limit updated', {
    botId,
    cooldownSeconds: Math.round(cooldownSeconds),
    hourlyCap: Math.round(hourlyCap),
  });

  res.json({ outboundCooldownSeconds: Math.round(cooldownSeconds), outboundHourlyCap: Math.round(hourlyCap) });
}

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

  try {
    const syncResult = await syncInboundRateLimitWorkflow(supabase, {
      ...bot,
      dograh_inbound_cooldown_seconds: Math.round(cooldownSeconds),
      dograh_inbound_hourly_cap: Math.round(hourlyCap),
    });

    logger.aiReceptionist('Inbound rate limit updated', {
      botId,
      cooldownSeconds: Math.round(cooldownSeconds),
      hourlyCap: Math.round(hourlyCap),
      activeWorkflow: syncResult.activeWorkflow,
    });

    res.json({
      inboundCooldownSeconds: Math.round(cooldownSeconds),
      inboundHourlyCap: Math.round(hourlyCap),
      inboundActiveWorkflow: syncResult.activeWorkflow,
      inboundRateLimitedUntil: syncResult.capacityUntil ? syncResult.capacityUntil.toISOString() : null,
    });
  } catch (err: any) {
    console.error('[phone-calls] Failed to sync inbound workflow after rate-limit update:', err);
    res.status(502).json({ error: err.message || 'Saved limit, but failed to sync the Dograh inbound workflow' });
  }
}

export async function callOut(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const { phoneNumber, contactName } = req.body || {};
  const normalizedContactName = typeof contactName === 'string' && contactName.trim().length > 0 ? contactName.trim() : undefined;

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
  const widgetConfig = (bot as any).widget_config || {};
  const outboundTelephony = widgetConfig.outboundTelephony || null;
  const activeTelephonyConfigId = outboundTelephony?.telephonyConfigId || bot.dograh_telephony_config_id;
  const activePhoneNumberId = outboundTelephony?.phoneNumberId || bot.dograh_phone_number_id;

  if (!activeTelephonyConfigId || !activePhoneNumberId) {
    if (bot.dograh_phone_number || outboundTelephony?.phoneNumber) {
      res.status(400).json({
        error: `Outbound calling requires an active telephone configuration. Please assign a phone number from the pool or connect your carrier.`
      });
      return;
    }
    res.status(400).json({ error: 'Assign an outbound phone number before placing outbound calls' });
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
      telephonyConfigId: activeTelephonyConfigId,
      fromPhoneNumberId: activePhoneNumberId,
      toPhoneNumber: maskPhoneNumber(validation.normalized),
      contactName: normalizedContactName,
    };
    console.log('[phone-calls] Initiating Dograh outbound call:', callContext);
    logger.callEvent('outbound_call_initiated', {
      botId,
      toPhoneNumber: maskPhoneNumber(validation.normalized),
      telephonyConfigId: activeTelephonyConfigId,
      fromPhoneNumberId: activePhoneNumberId,
      contactName: normalizedContactName,
    });

    // Pre-create session so pre-call hook, mirror, and prompt bind to the contact name
    let sessionId: string | undefined;
    try {
      const { data: session } = await supabase
        .from('chat_sessions')
        .insert({
          bot_id: botId,
          channel: 'phone',
          visitor_id: normalizedContactName || null,
        })
        .select('id')
        .single();
      sessionId = session?.id;
    } catch (err: any) {
      console.warn('[phone-calls] Could not pre-create session for outbound call:', err?.message);
    }

    if (sessionId) {
      registerOutboundCall({
        botId,
        phoneNumber: validation.normalized,
        contactName: normalizedContactName,
        sessionId,
      });
    }

    const initialContext: Record<string, unknown> = {
      direction: 'outbound',
      ...(normalizedContactName ? {
        contact_name: normalizedContactName,
        customer_name: normalizedContactName,
        name: normalizedContactName,
        caller_name: normalizedContactName,
      } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
    };

    const dograhResponse = await initiateCall({
      workflowId: bot.dograh_outbound_workflow_id,
      phoneNumber: validation.normalized,
      telephonyConfigId: activeTelephonyConfigId,
      fromPhoneNumberId: activePhoneNumberId,
      initialContext,
    });
    logger.callEvent('outbound_call_accepted', {
      botId,
      toPhoneNumber: maskPhoneNumber(validation.normalized),
      response: dograhResponse,
    });
    console.log('[phone-calls] Dograh outbound call accepted:', {
      ...callContext,
      dograhResponse,
    });
    res.json({ success: true, dograhResponse });
  } catch (err: any) {
    console.error('[phone-calls] Outbound call failed:', err);
    logger.callEvent('outbound_call_failed', {
      botId,
      toPhoneNumber: maskPhoneNumber(validation.normalized),
      error: err?.message,
    }, 'error');
    res.status(502).json({ error: err.message || 'Failed to place the outbound call' });
  }
}

export async function assignOutboundNumber(req: AuthRequest, res: Response): Promise<void> {
  try {
    const botId = req.params.botId;
    const bot = await loadOwnedBot(botId, req.user!.id);
    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    const { mode, provider, customPhoneNumber, telephonyConfigId, phoneNumberId, credentials, label } = req.body || {};
    const existingWidgetConfig = (bot as any).widget_config || {};

    // 1. Same as Inbound Receptionist Line
    if (mode === 'same_as_inbound') {
      const updatedWidgetConfig = { ...existingWidgetConfig };
      delete updatedWidgetConfig.outboundTelephony;
      let currentLines = extractConnectedLines(bot);
      currentLines.forEach(l => {
        l.isPrimaryOutbound = Boolean(l.isPrimaryInbound || (bot.dograh_phone_number && l.phoneNumber === bot.dograh_phone_number));
      });
      updatedWidgetConfig.connectedLines = currentLines;

      const { error } = await supabase
        .from('bots')
        .update({ widget_config: updatedWidgetConfig })
        .eq('id', botId);

      if (error) {
        res.status(500).json({ error: error.message || 'Failed to update outbound settings' });
        return;
      }

      logger.aiReceptionist('Outbound line configured: same as inbound', {
        botId,
        phoneNumber: bot.dograh_phone_number ? maskPhoneNumber(bot.dograh_phone_number) : null,
      });

      res.json({
        success: true,
        mode: 'same_as_inbound',
        phoneNumber: bot.dograh_phone_number || (bot as any).phone_number || null,
        connectedLines: currentLines,
      });
      return;
    }

    // 2. Priority 1: Default Platform Outbound Line
    if (mode === 'platform_default' || provider === 'pool') {
      let activeConfigId = telephonyConfigId ? Number(telephonyConfigId) : null;
      let activeNumberId = phoneNumberId ? Number(phoneNumberId) : null;
      let address = config.defaultPhoneNumber || '';

      if (!activeConfigId || !activeNumberId) {
        try {
          const configs = await listTelephonyConfigs();
          if (configs.length > 0) {
            const pns = await listPhoneNumbers(configs[0].id);
            if (pns.length > 0) {
              activeConfigId = configs[0].id;
              activeNumberId = pns[0].id;
              address = pns[0].address;
            }
          }
        } catch {
          // fallback
        }
      }

      if (!address) {
        res.status(400).json({ error: 'No platform pool outbound numbers available right now. Please connect a custom carrier or mirror your receptionist line.' });
        return;
      }

      const outboundTelephony = {
        mode: 'platform_default',
        provider: 'pool',
        phoneNumber: address,
        telephonyConfigId: activeConfigId ? String(activeConfigId) : (bot.dograh_telephony_config_id || '999999'),
        phoneNumberId: activeNumberId ? String(activeNumberId) : (bot.dograh_phone_number_id || '999999'),
        label: 'Default Platform Outgoing Line',
        configuredAt: new Date().toISOString(),
      };

      let currentLines = extractConnectedLines(bot);
      currentLines.forEach(l => { l.isPrimaryOutbound = false; });
      const existingIdx = currentLines.findIndex(l => l.phoneNumber === address && (l.type === 'outbound' || l.type === 'both'));
      if (existingIdx >= 0) {
        currentLines[existingIdx].isPrimaryOutbound = true;
        currentLines[existingIdx].status = 'active';
      } else {
        currentLines.push({
          id: `line_out_pool`,
          phoneNumber: address,
          type: 'outbound',
          provider: 'pool',
          label: 'Default Platform Outgoing Line',
          status: 'active',
          isPrimaryInbound: false,
          isPrimaryOutbound: true,
          configuredAt: new Date().toISOString(),
          telephonyConfigId: activeConfigId ? String(activeConfigId) : '999999',
          phoneNumberId: activeNumberId ? String(activeNumberId) : '999999',
        });
      }

      const { error } = await supabase
        .from('bots')
        .update({
          widget_config: {
            ...existingWidgetConfig,
            outboundTelephony,
            connectedLines: currentLines,
          },
        })
        .eq('id', botId);

      if (error) {
        res.status(500).json({ error: error.message || 'Failed to update outbound settings' });
        return;
      }

      logger.aiReceptionist('Outbound line configured: platform default', {
        botId,
        phoneNumber: maskPhoneNumber(address),
        telephonyConfigId: activeConfigId,
        phoneNumberId: activeNumberId,
      });

      res.json({
        success: true,
        outboundTelephony,
        phoneNumber: address,
        connectedLines: currentLines,
      });
      return;
    }

    // 3. Option 2: Custom BYOT Outbound Line (Asterisk, Twilio, Plivo, etc.)
    if (mode === 'byot' || ['asterisk', 'twilio', 'plivo', 'vonage', 'telnyx', 'custom'].includes(provider)) {
      let normalized = customPhoneNumber ? String(customPhoneNumber).trim() : '';
      let matchedConfigId: number | null = null;
      let matchedNumberId: number | null = null;

      if (provider === 'asterisk') {
        try {
          const createdConfig = await createTelephonyConfig({
            name: label || `Asterisk Outbound (${credentials?.appName || 'pbx'})`,
            is_default_outbound: true,
            config: {
              provider: 'ari',
              ari_endpoint: credentials?.ariEndpoint?.trim(),
              app_name: credentials?.appName?.trim(),
              app_password: credentials?.appPassword?.trim(),
              wsClientName: credentials?.wsClientName?.trim() || 'dograh',
              dialStringTemplate: credentials?.dialStringTemplate?.trim() || 'PJSIP/{number}',
            },
          });
          matchedConfigId = createdConfig.id;
          if (normalized) {
            try {
              const numRes = await createPhoneNumber(createdConfig.id, {
                address: normalized,
                is_active: true,
                is_default_caller_id: true,
              });
              matchedNumberId = numRes.id;
            } catch {}
          }
          normalized = normalized || '8000';
        } catch (err: any) {
          console.warn('[phone-calls] Asterisk outbound config warning:', err?.message);
        }
      } else if (provider === 'twilio') {
        const sid = credentials?.accountSid?.trim();
        const token = credentials?.authToken?.trim();
        if (sid && token) {
          try {
            const configName = label?.trim() || `Twilio Outbound (${maskPhoneNumber(normalized)})`;
            const createdConfig = await createTelephonyConfig({
              name: configName,
              is_default_outbound: true,
              config: {
                provider: 'twilio',
                account_sid: sid,
                auth_token: token,
              },
            });
            matchedConfigId = createdConfig.id;
            if (normalized) {
              try {
                const numRes = await createPhoneNumber(createdConfig.id, {
                  address: normalized,
                  is_active: true,
                  is_default_caller_id: true,
                });
                matchedNumberId = numRes.id;
              } catch (numErr: any) {
                console.warn('[phone-calls] Could not register outbound phone number under Dograh Twilio configuration:', numErr?.message);
              }
            }
          } catch (err: any) {
            console.warn('[phone-calls] Dograh createTelephonyConfig for Twilio outbound returned error:', err?.message);
          }
        }
      } else if (provider === 'plivo') {
        const authId = credentials?.authId?.trim();
        const authToken = credentials?.authToken?.trim();
        if (authId && authToken) {
          try {
            const configName = label?.trim() || `Plivo Outbound (${maskPhoneNumber(normalized)})`;
            const createdConfig = await createTelephonyConfig({
              name: configName,
              is_default_outbound: true,
              config: {
                provider: 'plivo',
                auth_id: authId,
                auth_token: authToken,
                app_id: credentials?.appId?.trim() || undefined,
              },
            });
            matchedConfigId = createdConfig.id;
            if (normalized) {
              try {
                const numRes = await createPhoneNumber(createdConfig.id, {
                  address: normalized,
                  is_active: true,
                  is_default_caller_id: true,
                });
                matchedNumberId = numRes.id;
              } catch (numErr: any) {
                console.warn('[phone-calls] Could not register outbound phone number under Dograh Plivo configuration:', numErr?.message);
              }
            }
          } catch (err: any) {
            console.warn('[phone-calls] Dograh createTelephonyConfig for Plivo outbound returned error:', err?.message);
          }
        }
      } else if (normalized) {
        const validation = validateContactInput('phone', normalized);
        if (validation.valid && validation.normalized) {
          normalized = validation.normalized;
        }
        try {
          const configs = await listTelephonyConfigs();
          for (const tc of configs) {
            const pns = await listPhoneNumbers(tc.id);
            const match = pns.find(n => n.address === normalized || n.address.replace(/\D/g, '') === normalized.replace(/\D/g, ''));
            if (match) {
              matchedConfigId = tc.id;
              matchedNumberId = match.id;
              break;
            }
          }
        } catch {}
      }

      const outboundTelephony = {
        mode: 'byot',
        provider: provider || 'custom',
        phoneNumber: normalized || customPhoneNumber || 'Custom Outbound',
        telephonyConfigId: matchedConfigId ? String(matchedConfigId) : (bot.dograh_telephony_config_id || '999999'),
        phoneNumberId: matchedNumberId ? String(matchedNumberId) : (bot.dograh_phone_number_id || '999999'),
        label: label || `${provider?.toUpperCase()} Outbound Line`,
        credentials: credentials ? {
          accountSid: credentials.accountSid,
          authId: credentials.authId,
          appId: credentials.appId,
          apiKey: credentials.apiKey,
          ariEndpoint: credentials.ariEndpoint,
          appName: credentials.appName,
          wsClientName: credentials.wsClientName,
          dialStringTemplate: credentials.dialStringTemplate,
        } : undefined,
        configuredAt: new Date().toISOString(),
      };

      let currentLines = extractConnectedLines(bot);
      currentLines.forEach(l => { l.isPrimaryOutbound = false; });
      const outboundNumStr = outboundTelephony.phoneNumber;
      const existingIdx = currentLines.findIndex(l => l.phoneNumber === outboundNumStr && (l.type === 'outbound' || l.type === 'both'));
      if (existingIdx >= 0) {
        currentLines[existingIdx].isPrimaryOutbound = true;
        currentLines[existingIdx].status = 'active';
        currentLines[existingIdx].provider = provider || currentLines[existingIdx].provider;
        currentLines[existingIdx].label = label || currentLines[existingIdx].label;
      } else {
        currentLines.push({
          id: `line_out_${Date.now()}`,
          phoneNumber: outboundNumStr,
          type: 'outbound',
          provider: (provider as any) || 'custom',
          label: label || `${(provider || 'Custom').toUpperCase()} Outbound Line`,
          status: 'active',
          isPrimaryInbound: false,
          isPrimaryOutbound: true,
          configuredAt: new Date().toISOString(),
          telephonyConfigId: matchedConfigId ? String(matchedConfigId) : null,
          phoneNumberId: matchedNumberId ? String(matchedNumberId) : null,
        });
      }

      const { error } = await supabase
        .from('bots')
        .update({
          widget_config: {
            ...existingWidgetConfig,
            outboundTelephony,
            connectedLines: currentLines,
          },
        })
        .eq('id', botId);

      if (error) {
        res.status(500).json({ error: error.message || 'Failed to update outbound settings' });
        return;
      }

      logger.aiReceptionist('Outbound line configured: custom telephony', {
        botId,
        provider: provider || 'custom',
        phoneNumber: maskPhoneNumber(normalized || customPhoneNumber || ''),
        label,
      });

      res.json({
        success: true,
        outboundTelephony,
        phoneNumber: outboundTelephony.phoneNumber,
        connectedLines: currentLines,
      });
      return;
    }

    res.status(400).json({ error: 'Invalid outbound number options' });
  } catch (err: any) {
    console.error('[phone-calls] assignOutboundNumber error:', err);
    logger.aiReceptionist('Outbound line configuration failed', {
      botId: req.params.botId,
      error: err?.message,
    }, 'error');
    res.status(500).json({ error: err.message || 'Failed to configure outbound number' });
  }
}

export async function addPhoneLine(req: AuthRequest, res: Response): Promise<void> {
  try {
    const botId = req.params.botId;
    const bot = await loadOwnedBot(botId, req.user!.id);
    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    const { phoneNumber, type = 'inbound', provider = 'custom', label, credentials } = req.body || {};
    if (!phoneNumber) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }

    let normalized = String(phoneNumber).trim();
    if (provider !== 'asterisk' && provider !== 'ari') {
      const validation = validateContactInput('phone', normalized);
      if (!validation.valid || !validation.normalized) {
        res.status(400).json({ error: validation.error || 'Please enter a valid phone number' });
        return;
      }
      normalized = validation.normalized;
    }

    const existingWidgetConfig = (bot as any).widget_config || {};
    let currentLines = extractConnectedLines(bot);

    const existingIndex = currentLines.findIndex(l => l.phoneNumber === normalized && (l.type === type || l.type === 'both'));
    if (existingIndex >= 0) {
      currentLines[existingIndex].label = label || currentLines[existingIndex].label;
      currentLines[existingIndex].status = 'active';
    } else {
      const newLine: ConnectedPhoneLine = {
        id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        phoneNumber: normalized,
        type: type as any,
        provider: provider as any,
        label: label || `${provider.toUpperCase()} Line`,
        status: 'active',
        isPrimaryInbound: type === 'inbound' && !currentLines.some(l => l.isPrimaryInbound),
        isPrimaryOutbound: type === 'outbound' && !currentLines.some(l => l.isPrimaryOutbound),
        configuredAt: new Date().toISOString(),
        credentials: credentials || undefined,
      };
      currentLines.push(newLine);
    }

    const updatedWidgetConfig = {
      ...existingWidgetConfig,
      connectedLines: currentLines,
    };

    const { error } = await supabase
      .from('bots')
      .update({ widget_config: updatedWidgetConfig })
      .eq('id', botId);

    if (error) {
      res.status(500).json({ error: error.message || 'Failed to save connected phone line' });
      return;
    }

    res.json({ success: true, connectedLines: currentLines });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to add phone line' });
  }
}

export async function removePhoneLine(req: AuthRequest, res: Response): Promise<void> {
  try {
    const botId = req.params.botId;
    const lineId = req.params.lineId;
    const bot = await loadOwnedBot(botId, req.user!.id);
    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    const existingWidgetConfig = (bot as any).widget_config || {};
    let currentLines = extractConnectedLines(bot);
    const targetLine = currentLines.find(l => l.id === lineId || l.phoneNumber === lineId);
    if (!targetLine) {
      res.status(404).json({ error: 'Phone line not found' });
      return;
    }

    currentLines = currentLines.filter(l => l.id !== targetLine.id && l.phoneNumber !== targetLine.phoneNumber);

    const updates: any = {};
    const updatedWidgetConfig = { ...existingWidgetConfig, connectedLines: currentLines };

    if (targetLine.isPrimaryInbound || bot.dograh_phone_number === targetLine.phoneNumber) {
      const nextInbound = currentLines.find(l => l.type === 'inbound' || l.type === 'both');
      if (nextInbound) {
        nextInbound.isPrimaryInbound = true;
        updates.dograh_phone_number = nextInbound.phoneNumber;
      } else {
        updates.dograh_phone_number = null;
        updates.dograh_phone_number_id = null;
        updates.dograh_telephony_config_id = null;
        delete updatedWidgetConfig.telephony;
      }
    }

    if (targetLine.isPrimaryOutbound || existingWidgetConfig.outboundTelephony?.phoneNumber === targetLine.phoneNumber) {
      delete updatedWidgetConfig.outboundTelephony;
    }

    if (targetLine.type === 'forwarding') {
      delete updatedWidgetConfig.forwardingPhoneNumber;
    }

    updates.widget_config = updatedWidgetConfig;

    const { error } = await supabase.from('bots').update(updates).eq('id', botId);
    if (error) {
      res.status(500).json({ error: error.message || 'Failed to remove line' });
      return;
    }

    res.json({ success: true, connectedLines: currentLines });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to remove line' });
  }
}

export async function setPrimaryPhoneLine(req: AuthRequest, res: Response): Promise<void> {
  try {
    const botId = req.params.botId;
    const lineId = req.params.lineId;
    const { role } = req.body || {}; // 'inbound' | 'outbound'
    const bot = await loadOwnedBot(botId, req.user!.id);
    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    const existingWidgetConfig = (bot as any).widget_config || {};
    let currentLines = extractConnectedLines(bot);
    const targetLine = currentLines.find(l => l.id === lineId || l.phoneNumber === lineId);
    if (!targetLine) {
      res.status(404).json({ error: 'Phone line not found' });
      return;
    }

    const updates: any = {};
    const updatedWidgetConfig = { ...existingWidgetConfig };

    if (role === 'inbound') {
      currentLines.forEach(l => {
        l.isPrimaryInbound = (l.id === targetLine.id);
      });
      updates.dograh_phone_number = targetLine.phoneNumber;
    } else if (role === 'outbound') {
      currentLines.forEach(l => {
        l.isPrimaryOutbound = (l.id === targetLine.id);
      });
      updatedWidgetConfig.outboundTelephony = {
        mode: 'byot',
        provider: targetLine.provider,
        phoneNumber: targetLine.phoneNumber,
        telephonyConfigId: targetLine.telephonyConfigId || bot.dograh_telephony_config_id,
        phoneNumberId: targetLine.phoneNumberId || bot.dograh_phone_number_id,
        label: targetLine.label,
        configuredAt: new Date().toISOString(),
      };
    }

    updatedWidgetConfig.connectedLines = currentLines;
    updates.widget_config = updatedWidgetConfig;

    const { error } = await supabase.from('bots').update(updates).eq('id', botId);
    if (error) {
      res.status(500).json({ error: error.message || 'Failed to update primary line' });
      return;
    }

    res.json({ success: true, connectedLines: currentLines });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update primary line' });
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
    logger.aiReceptionist('Manual call sync completed', {
      botId,
      ingested: result.ingested,
      failed: result.failed,
    });
    res.json(result);
  } catch (err: any) {
    console.error('[phone-calls] Manual sync failed:', err);
    logger.aiReceptionist('Manual call sync failed', {
      botId,
      error: err?.message,
    }, 'error');
    res.status(502).json({ error: err.message || 'Failed to sync calls from Dograh' });
  }
}

export async function prepareOutboundWorkflowForContact(
  bot: DograhProvisionableBot,
  contactName?: string
): Promise<void> {
  if (!bot.dograh_outbound_workflow_id) return;
  try {
    const widgetConfig = mergeWidgetConfig((bot as any).widget_config, bot);
    const callbackUrl = (config.phoneTools.callbackBaseUrl || '').trim();
    let isCallbackLive = false;
    if (callbackUrl && !callbackUrl.includes('localhost') && !callbackUrl.includes('host.docker.internal')) {
      try {
        const ping = await fetch(callbackUrl, { signal: AbortSignal.timeout(2000) });
        if (ping.status < 500 && ping.status !== 404) {
          isCallbackLive = true;
        }
      } catch {
        isCallbackLive = false;
      }
    }

    const useTools = isCallbackLive && widgetConfig.enableCalendar && (await isCalendarConnected(bot.owner_id));

    let checkAvailabilityToolUuid = bot.dograh_check_availability_tool_uuid;
    let bookAppointmentToolUuid = bot.dograh_book_appointment_tool_uuid;
    if (useTools && (!checkAvailabilityToolUuid || !bookAppointmentToolUuid)) {
      try {
        const tools = await ensurePhoneTools(bot);
        checkAvailabilityToolUuid = tools.checkAvailabilityToolUuid;
        bookAppointmentToolUuid = tools.bookAppointmentToolUuid;
      } catch (err) {
        console.warn('[phone-calls] Could not ensure calendar tools for outbound personalization:', err);
      }
    }

    const callTimeToolUuid = bot.dograh_call_time_tool_uuid || (await ensureCallTimeTool(bot));
    const toolUuids = useTools && checkAvailabilityToolUuid && bookAppointmentToolUuid
      ? [callTimeToolUuid, checkAvailabilityToolUuid, bookAppointmentToolUuid]
      : [callTimeToolUuid];

    const extractionVariables = buildLeadExtractionVariables(withoutAutoKnownPhoneField(widgetConfig));
    const preCallFetchBase = isCallbackLive
      ? `${callbackUrl}/api/phone-tools/${bot.id}/pre-call?key=${config.phoneTools.apiKey}`
      : '';
    const outboundPreCallFetchUrl = preCallFetchBase ? `${preCallFetchBase}&direction=outbound` : '';

    const outboundInstruction = buildDograhOutboundInstruction(bot, widgetConfig, {
      timezone: PHONE_DEFAULT_TIMEZONE,
      useToolBasedBooking: useTools,
      contactName,
    });
    const outboundDefinition = buildSingleNodeWorkflowDefinition({
      personaPrompt: outboundInstruction,
      extractionVariables,
      isOutbound: true,
      businessName: bot.business_name,
      toolUuids,
      preCallFetchUrl: outboundPreCallFetchUrl,
      contactName,
      customOutboundPrompt: widgetConfig.outboundPromptTemplate,
      useToolBasedBooking: useTools,
    });

    await updateWorkflowInPlace(bot.dograh_outbound_workflow_id, outboundDefinition, WORKFLOW_CONFIGURATIONS);
    await publishWorkflow(bot.dograh_outbound_workflow_id);
    console.log(`[phone-calls] Personalised outbound workflow ${bot.dograh_outbound_workflow_id} for contact: "${contactName || '(anonymous)'}"`);
  } catch (err) {
    console.warn('[phone-calls] Failed to personalise outbound workflow before calling:', err);
  }
}

export async function generatePromptTemplate(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }
  const { userInstruction, type } = req.body || {};
  if (!userInstruction || typeof userInstruction !== 'string') {
    res.status(400).json({ error: 'userInstruction is required' });
    return;
  }

  try {
    const prompt = `You are an expert voice AI prompt engineer for telecalling.
Business: ${bot.business_name}
Industry: ${bot.industry}
Call Type: ${type === 'outbound' ? 'Outbound Sales Telecalling' : 'Inbound Receptionist'}
Knowledge Base: ${bot.knowledge_base}

User's custom requirements: ${userInstruction}

Write a natural, conversational, turn-by-turn prompt in the business's language that:
1. Warmly greets with appropriate respectful honorifics.
2. Identifies customer name, inquiry, and requirement.
3. Shares attractive highlights strictly grounded in the business knowledge base.
4. Invites for an appointment, meeting, or visit if relevant to the business.
5. Asks if caller has any other questions before closing.
6. Concludes politely with a warm closing.
Do not wrap in markdown quotes. Output only the prompt template.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.geminiApiKey}`;
    const resp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    const data = await resp.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({ generatedTemplate: generatedText.trim() });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate prompt template' });
  }
}
