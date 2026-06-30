import { Request, Response } from 'express';
import { supabase } from '../../services/db';
import { checkCalendarAvailability, bookCalendarAppointment, serializeCalendarToolError } from '../../services/calendar/calendarOperations';

/**
 * Endpoints Dograh's own backend calls back into mid-call (pre-call session creation, then the
 * check_availability/book_appointment tools attached to the conversation node) - see
 * dograhController.ts for where these get wired into a bot's workflow. Auth is the shared
 * X-API-Key secret (requirePhoneToolsApiKey middleware), not Supabase user auth: the caller is
 * Dograh's container, not a logged-in owner's browser.
 */

async function loadBotOwner(botId: string): Promise<{ owner_id: string } | null> {
  const { data, error } = await supabase.from('bots').select('owner_id').eq('id', botId).single();
  if (error || !data) return null;
  return data;
}

/** Attached as startCall.pre_call_fetch_url. Creates the chat_sessions row before the call
 * connects, so it already exists by the time any tool call (or the post-call mirror) needs it. */
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

  // Dograh's pre-call-fetch extractor only merges variables nested under an `initial_context`
  // key (or the legacy `dynamic_variables`) - a flat `{ session_id }` body is silently ignored,
  // which is exactly what produced "Preset parameter 'session_id' resolved to an empty value" on
  // the first test call. See api/services/pipecat/pre_call_fetch.py's _extract_initial_context.
  res.json({ initial_context: { session_id: session.id } });
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
  try {
    const slots = await checkCalendarAvailability({ db: supabase, ownerId: bot.owner_id, date, timezone });
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

  try {
    const result = await bookCalendarAppointment({
      db: supabase,
      ownerId: bot.owner_id,
      botId,
      sessionId: session_id,
      timezone,
      details,
    });
    res.json(result);
  } catch (err: any) {
    res.json(serializeCalendarToolError(err));
  }
}
