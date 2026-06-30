import { Request, Response } from 'express';
import { supabase } from '../../services/db';
import { checkCalendarAvailability, bookCalendarAppointment, serializeCalendarToolError } from '../../services/calendar/calendarOperations';
import { mergeWidgetConfig } from '../../utils/widgetConfig';

/**
 * Endpoints Dograh's own backend calls back into mid-call (pre-call session creation, then the
 * check_availability/book_appointment tools attached to the conversation node) - see
 * dograhController.ts for where these get wired into a bot's workflow. Auth is the shared
 * X-API-Key secret (requirePhoneToolsApiKey middleware), not Supabase user auth: the caller is
 * Dograh's container, not a logged-in owner's browser.
 */

async function loadBotOwner(botId: string): Promise<{ owner_id: string; widget_config: any } | null> {
  const { data, error } = await supabase.from('bots').select('owner_id, widget_config').eq('id', botId).single();
  if (error || !data) return null;
  return data;
}

interface InboundRateLimitBot {
  dograh_inbound_cooldown_seconds: number | null;
  dograh_inbound_hourly_cap: number | null;
}

async function loadInboundRateLimit(botId: string): Promise<InboundRateLimitBot | null> {
  const { data, error } = await supabase
    .from('bots')
    .select('dograh_inbound_cooldown_seconds, dograh_inbound_hourly_cap')
    .eq('id', botId)
    .single();
  if (error || !data) return null;
  return data;
}

// In-memory, single-process - same constraint/reasoning as the outbound limiter in
// dograhController.ts. There is no way to refuse an inbound call before it rings (Plivo calls
// Dograh directly, not this server - see docs/AWS_DEPLOYMENT.md's call-routing notes), so this
// caps cost/abuse on the *answered* side: pre-call-fetch runs before the persona starts talking,
// so an over-limit caller still gets connected and hears a few seconds of audio, but the agent
// declines and ends the call immediately instead of running a normal conversation - see the
// RATE_LIMITED template variable in workflowDefinition.ts's inbound conversation prompt.
const DEFAULT_INBOUND_COOLDOWN_SECONDS = 10;
const DEFAULT_INBOUND_HOURLY_CAP = 20;
const lastInboundCallAtByBot = new Map<string, number>();
const inboundCallTimestampsByBot = new Map<string, number[]>();

function isInboundRateLimited(botId: string, bot: InboundRateLimitBot): boolean {
  const now = Date.now();
  const cooldownMs = (bot.dograh_inbound_cooldown_seconds ?? DEFAULT_INBOUND_COOLDOWN_SECONDS) * 1000;
  const hourlyCap = bot.dograh_inbound_hourly_cap ?? DEFAULT_INBOUND_HOURLY_CAP;

  const lastCallAt = lastInboundCallAtByBot.get(botId);
  const hourAgo = now - 60 * 60 * 1000;
  const recent = (inboundCallTimestampsByBot.get(botId) || []).filter(ts => ts > hourAgo);

  const limited = Boolean(lastCallAt && now - lastCallAt < cooldownMs) || recent.length >= hourlyCap;

  // Still record the attempt even when over the limit - otherwise a burst of calls inside one
  // cooldown window would each reset the clock and the cooldown would never actually bite.
  recent.push(now);
  inboundCallTimestampsByBot.set(botId, recent);
  lastInboundCallAtByBot.set(botId, now);

  return limited;
}

/** Attached as startCall.pre_call_fetch_url for both directions (the URL carries a `direction`
 * query param - see dograhController.ts). Creates the chat_sessions row before the call
 * connects, so it already exists by the time any tool call (or the post-call mirror) needs it.
 * For inbound calls only, also checks the owner-configured rate limit and flags the persona
 * prompt to decline and end immediately when it's exceeded - outbound calls skip this check
 * since they're already gated before dialing in dograhController.ts's callOut. */
export async function preCall(req: Request, res: Response): Promise<void> {
  const botId = req.params.botId;
  const bot = await loadBotOwner(botId);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  const { data: session, error } = await supabase
    .from('chat_sessions')
    .insert({ bot_id: botId, channel: 'phone' })
    .select()
    .single();
  if (error || !session) {
    res.status(500).json({ error: error?.message || 'Failed to create phone call session' });
    return;
  }

  let rateLimited = false;
  if (req.query.direction === 'inbound') {
    const rateLimitBot = await loadInboundRateLimit(botId);
    rateLimited = rateLimitBot ? isInboundRateLimited(botId, rateLimitBot) : false;
  }

  // Dograh's pre-call-fetch extractor only merges variables nested under an `initial_context`
  // key (or the legacy `dynamic_variables`) - a flat `{ session_id }` body is silently ignored,
  // which is exactly what produced "Preset parameter 'session_id' resolved to an empty value" on
  // the first test call. See api/services/pipecat/pre_call_fetch.py's _extract_initial_context.
  res.json({ initial_context: { session_id: session.id, rate_limited: rateLimited } });
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
  const { session_id } = req.body || {};
  if (!session_id) {
    res.json({ error: 'No active call session.' });
    return;
  }

  const { data: session, error } = await supabase.from('chat_sessions').select('started_at').eq('id', session_id).maybeSingle();
  if (error || !session?.started_at) {
    res.json({ error: 'Could not determine call start time.' });
    return;
  }

  const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000));
  const remainingSeconds = SOFT_LIMIT_SECONDS - elapsedSeconds;
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
  try {
    const slots = await checkCalendarAvailability({
      db: supabase,
      ownerId: bot.owner_id,
      date,
      timezone,
      maxBookingDaysAhead: widgetConfig.maxBookingDaysAhead
    });
    res.json({ slots });
  } catch (err: any) {
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

  const { session_id, timezone, ...details } = req.body || {};
  if (!session_id) {
    res.json({ error: 'No active call session - this tool can only be used during a live phone call.' });
    return;
  }

  const widgetConfig = mergeWidgetConfig(bot.widget_config);
  try {
    const result = await bookCalendarAppointment({
      db: supabase,
      ownerId: bot.owner_id,
      botId,
      sessionId: session_id,
      timezone,
      details,
      maxBookingDaysAhead: widgetConfig.maxBookingDaysAhead
    });
    res.json(result);
  } catch (err: any) {
    res.json(serializeCalendarToolError(err));
  }
}
