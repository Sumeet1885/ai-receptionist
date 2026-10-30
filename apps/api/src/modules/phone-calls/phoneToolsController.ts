import { Request, Response } from 'express';
import { callingMinutesAvailable, getMinuteSummary } from '../billing/minutes';
import { supabase } from '../../services/db';
import { checkCalendarAvailability, bookCalendarAppointment, serializeCalendarToolError } from '../../services/calendar/calendarOperations';
import { mergeWidgetConfig } from '../../utils/widgetConfig';
import { normalizeTimezone } from '../../utils/date';
import { InboundRateLimitBot, markInboundAttemptAndApplyLimit, refreshWorkspaceCallingLimits } from './inboundRateLimiter';
import { logger } from '../../services/cloudwatchLogger';
import { findOutboundCall, getLatestOutboundCallForBot } from './outboundTracker';
import { getCustomerConcurrentLimitInfo, trackCallStart } from './concurrentTracker';


/**
 * Endpoints Dograh's own backend calls back into mid-call (pre-call session creation, then the
 * check_availability/book_appointment tools attached to the conversation node) - see
 * dograhController.ts for where these get wired into a bot's workflow. Auth is the shared
 * X-API-Key secret (requirePhoneToolsApiKey middleware), not Supabase user auth: the caller is
 * Dograh's container, not a logged-in owner's browser.
 */

async function loadBotOwner(botId: string): Promise<({ owner_id: string; widget_config: any } & InboundRateLimitBot) | null> {
  const { data, error } = await supabase
    .from('bots')
    .select(
      'id, owner_id, widget_config, dograh_workflow_id, dograh_capacity_workflow_id, dograh_telephony_config_id, dograh_phone_number_id, dograh_inbound_cooldown_seconds, dograh_inbound_hourly_cap, dograh_inbound_active_workflow, dograh_inbound_rate_limited_until'
    )
    .eq('id', botId)
    .single();
  if (error || !data) return null;
  return data;
}

/** Attached as startCall.pre_call_fetch_url for both directions (the URL carries a `direction`
 * query param - see dograhController.ts). Creates the chat_sessions row before the call
 * connects, so it already exists by the time any tool call (or the post-call mirror) needs it.
 * For inbound calls only, records this accepted call attempt and, when the configured cooldown
 * or hourly cap is reached, proactively points the phone number at the instant-hangup capacity
 * workflow so the next inbound call is cut before the normal receptionist persona starts. */
export async function preCall(req: Request, res: Response): Promise<void> {
  const botId = req.params.botId;
  const bot = await loadBotOwner(botId);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  const isOutbound = req.query.direction === 'outbound';

  // Check parallel calls limit for the customer
  const concurrentLimit = await getCustomerConcurrentLimitInfo(bot.owner_id);
  if (concurrentLimit.current >= concurrentLimit.effectiveLimit) {
    logger.warn('[phone-calls] Inbound parallel call limit reached', {
      botId,
      ownerId: bot.owner_id,
      current: concurrentLimit.current,
      effectiveLimit: concurrentLimit.effectiveLimit,
    });
    res.json({
      initial_context: {
        rate_limited: true,
        concurrent_limit_reached: true,
        session_id: null,
      },
    });
    return;
  }
  if (!await callingMinutesAvailable(bot.owner_id)) {
    await refreshWorkspaceCallingLimits(supabase, bot.owner_id);
    res.json({ initial_context: { rate_limited: true, minutes_exhausted: true, session_id: null } });
    return;
  }
  const outboundMeta = isOutbound
    ? (findOutboundCall({
        botId,
        phoneNumber: (req.body?.phone_number || req.body?.to_number || req.query?.to) as string | undefined,
      }) || getLatestOutboundCallForBot(botId))
    : undefined;

  let sessionId = outboundMeta?.sessionId;
  let contactName = outboundMeta?.contactName;

  if (sessionId) {
    const { data: existingSession } = await supabase
      .from('chat_sessions')
      .select('id, visitor_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (!existingSession) {
      sessionId = undefined;
    } else if (!contactName && existingSession.visitor_id) {
      contactName = existingSession.visitor_id;
    }
  }

  if (!sessionId) {
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .insert({
        bot_id: botId,
        channel: 'phone',
        visitor_id: contactName?.trim() || null,
      })
      .select()
      .single();
    if (error || !session) {
      res.status(500).json({ error: error?.message || 'Failed to create phone call session' });
      return;
    }
    sessionId = session.id;
  }

  if (req.query.direction === 'inbound') {
    trackCallStart({
      key: sessionId,
      ownerId: bot.owner_id,
      botId,
      direction: 'inbound',
      sessionId,
    });
    try {
      await markInboundAttemptAndApplyLimit(supabase, bot);
    } catch (err) {
      // Never break the current legitimate caller because the protection mechanism failed.
      // The error is noisy in logs so deployment/schema/Dograh issues are still visible.
      console.error(`[phone-calls] Inbound rate-limit workflow switch failed for bot ${botId}:`, err);
    }
  }

  logger.callEvent('pre_call_session_created', {
    botId,
    sessionId,
    contactName: contactName || undefined,
    direction: isOutbound ? 'outbound' : 'inbound',
  });

  // Dograh's pre-call-fetch extractor merges variables nested under an `initial_context` key.
  // Passing contact_name ensures the LLM's active turn context knows the caller's pre-entered name.
  res.json({
    initial_context: {
      session_id: sessionId,
      rate_limited: false,
      ...(contactName ? {
        contact_name: contactName,
        customer_name: contactName,
        name: contactName,
      } : {}),
    },
  });
}

/** Deterministic alternative to the model guessing elapsed time: Dograh has no mid-call clock
 * signal of its own (see MAX_CALL_DURATION_SECONDS comment in workflowDefinition.ts), so the
 * persona is instructed to call this tool to find out exactly how long is left before the call's
 * soft limit, instead of estimating from "how many exchanges have happened so far". */
// Soft wrap-up target: ~30s ahead of MAX_CALL_DURATION_SECONDS's hard backstop in
// workflowDefinition.ts, so a graceful goodbye (driven by this tool + the persona prompt) lands
// before the silent native abort would ever need to fire.
const SOFT_LIMIT_SECONDS = 270;

export async function callTimeRemaining(req: Request, res: Response): Promise<void> {
  let { session_id } = req.body || {};
  const botId = req.params.botId;

  if (!session_id && botId) {
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('bot_id', botId)
      .eq('channel', 'phone')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (session) {
      session_id = session.id;
    }
  }

  if (!session_id) {
    res.json({
      elapsedSeconds: 0,
      remainingSeconds: SOFT_LIMIT_SECONDS,
      shouldWrapUp: false,
    });
    return;
  }

  const { data: session, error } = await supabase.from('chat_sessions').select('started_at').eq('id', session_id).eq('bot_id', botId).maybeSingle();
  if (error || !session?.started_at) {
    res.json({
      elapsedSeconds: 0,
      remainingSeconds: SOFT_LIMIT_SECONDS,
      shouldWrapUp: false,
    });
    return;
  }

  const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000));
  const bot = await loadBotOwner(botId);
  const balance = bot ? await getMinuteSummary(bot.owner_id) : null;
  const budgetSeconds = balance?.active ? balance.remainingMinutes === null ? SOFT_LIMIT_SECONDS : Math.max(0, balance.remainingMinutes * 60) : 0;
  const remainingSeconds = Math.min(SOFT_LIMIT_SECONDS, budgetSeconds) - elapsedSeconds;
  res.json({
    elapsedSeconds,
    remainingSeconds,
    shouldWrapUp: remainingSeconds <= 0,
  });
}

export async function checkAvailability(req: Request, res: Response): Promise<void> {
  const botId = req.params.botId;
  const bot = await loadBotOwner(botId);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  const { date, timezone } = req.body || {};
  const widgetConfig = mergeWidgetConfig(bot.widget_config);
  const effectiveTimezone = normalizeTimezone(timezone || (widgetConfig as any).timezone, 'Asia/Kolkata');
  try {
    const slots = await checkCalendarAvailability({
      db: supabase,
      ownerId: bot.owner_id,
      date,
      timezone: effectiveTimezone,
      maxBookingDaysAhead: widgetConfig.maxBookingDaysAhead
    });
    const slotCount = Array.isArray(slots) ? slots.length : 0;
    logger.aiReceptionist('Phone tool check_availability called', {
      botId,
      date,
      timezone,
      slotCount,
    });
    res.json({ slots });
  } catch (err: any) {
    logger.aiReceptionist('Phone tool check_availability failed', {
      botId,
      date,
      error: err?.message,
    }, 'warn');
    res.json(serializeCalendarToolError(err));
  }
}

export async function bookAppointment(req: Request, res: Response): Promise<void> {
  const botId = req.params.botId;
  const bot = await loadBotOwner(botId);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  let { session_id, timezone, ...details } = req.body || {};

  // If session_id was not provided (e.g. Dograh tool testing or direct call without pre-call session),
  // link to the most recent active call session or auto-create a fallback session.
  if (!session_id) {
    const { data: recentSession } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('bot_id', botId)
      .eq('channel', 'phone')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentSession?.id) {
      const { data: existingAppt } = await supabase
        .from('appointments')
        .select('id')
        .eq('session_id', recentSession.id)
        .eq('status', 'confirmed')
        .maybeSingle();

      if (!existingAppt) {
        session_id = recentSession.id;
      }
    }

    if (!session_id) {
      const { data: newSession } = await supabase
        .from('chat_sessions')
        .insert({ bot_id: botId, channel: 'phone' })
        .select('id')
        .single();
      session_id = newSession?.id;
    }
  }

  if (!session_id) {
    res.json({ error: 'No active call session - this tool can only be used during a live phone call.' });
    return;
  }

  const widgetConfig = mergeWidgetConfig(bot.widget_config);
  const effectiveTimezone = normalizeTimezone(timezone || (widgetConfig as any).timezone, 'Asia/Kolkata');
  try {
    const result = await bookCalendarAppointment({
      db: supabase,
      ownerId: bot.owner_id,
      botId,
      sessionId: session_id,
      timezone: effectiveTimezone,
      details,
      maxBookingDaysAhead: widgetConfig.maxBookingDaysAhead
    });
    logger.leadEvent('appointment_booked_via_phone_tool', {
      botId,
      sessionId: session_id,
      title: details?.title,
      startTime: details?.startTime,
      endTime: details?.endTime,
      visitorName: details?.visitorName,
      visitorPhone: details?.visitorPhone,
      eventId: result.eventId,
    });
    res.json(result);
  } catch (err: any) {
    logger.aiReceptionist('Phone tool book_appointment threw exception', {
      botId,
      sessionId: session_id,
      error: err?.message,
    }, 'error');
    res.json(serializeCalendarToolError(err));
  }
}
