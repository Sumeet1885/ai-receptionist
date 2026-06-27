import { SupabaseClient } from '@supabase/supabase-js';
import { analyzeLead } from '../../controllers/leadController';
import { fetchTranscript, getRun, listRuns } from './dograhClient';
import { DograhProvisionableBot, DograhRunDetail } from './types';

interface TranscriptTurn {
  sender: 'user' | 'bot';
  content: string;
}

const USER_ROLE_HINTS = ['user', 'caller', 'visitor', 'human', 'customer'];

function senderForRole(role: string): 'user' | 'bot' {
  const normalized = role.toLowerCase();
  return USER_ROLE_HINTS.some(hint => normalized.includes(hint)) ? 'user' : 'bot';
}

/**
 * Dograh's transcript payload shape isn't pinned down by the OpenAPI schema. The public
 * download endpoint returns a plain-text `.txt` ("Speaker: line" per turn); some deployments
 * return a JSON array. This tolerates both — a JSON array of {role|speaker, content|text|message}
 * turns, or a line-based "Role: content" text transcript — instead of assuming one format.
 */
function parseTranscript(raw: unknown): TranscriptTurn[] {
  if (Array.isArray(raw)) {
    return raw
      .map((entry: any): TranscriptTurn | null => {
        const role = String(entry?.role ?? entry?.speaker ?? '');
        const content = entry?.content ?? entry?.text ?? entry?.message ?? '';
        if (!content) return null;
        return { sender: senderForRole(role), content: String(content).trim() };
      })
      .filter((turn): turn is TranscriptTurn => turn !== null && turn.content.length > 0);
  }

  if (typeof raw === 'string' && raw.trim()) {
    // Line-based "Speaker: utterance" format. Lines without a recognizable speaker prefix are
    // treated as continuations of the previous turn (multi-line utterances), so nothing is lost.
    const turns: TranscriptTurn[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^([A-Za-z][\w .'-]{0,30}?)\s*[:\-]\s*(.+)$/);
      if (match) {
        turns.push({ sender: senderForRole(match[1]), content: match[2].trim() });
      } else if (turns.length > 0) {
        turns[turns.length - 1].content += ` ${trimmed}`;
      } else {
        // No speaker prefix at all (free-form note) — keep it rather than drop the call's content.
        turns.push({ sender: 'bot', content: trimmed });
      }
    }
    return turns;
  }

  return [];
}

/**
 * The number of the OTHER party on the call (shown in the UI). For inbound that's the external
 * caller; for outbound it's the number we dialed — NOT `caller_number`, which on an outbound run
 * is the bot's own Twilio caller ID and would mislead the owner about who was contacted.
 */
function extractCounterpartyNumber(run: DograhRunDetail): string | null {
  const initial = run.initial_context as Record<string, any> | null;
  const gathered = run.gathered_context as Record<string, any> | null;
  if (run.call_type === 'outbound') {
    return initial?.phone_number ?? initial?.called_number ?? gathered?.phone ?? gathered?.phone_number ?? null;
  }
  return (
    initial?.from_number ??
    initial?.caller_number ??
    initial?.phone_number ??
    gathered?.phone ??
    gathered?.phone_number ??
    null
  );
}

function extractDurationSeconds(run: DograhRunDetail): number | null {
  const usage = run.usage_info as Record<string, any> | null;
  const cost = run.cost_info as Record<string, any> | null;
  return (
    usage?.call_duration_seconds ??
    usage?.duration_seconds ??
    cost?.call_duration_seconds ??
    cost?.duration_seconds ??
    null
  );
}

export interface SyncResult {
  ingested: number;
  failed: number;
}

/**
 * Pulls completed Dograh runs for one bot's workflows (inbound and, if provisioned, outbound)
 * and mirrors each into Supabase (chat_sessions + messages + leads), claim-first so a crash
 * mid-sync is resumable without creating duplicate sessions. Pure function of
 * (bot, Dograh API, Supabase) — never invoked as a side effect of a read; only the poller and
 * the explicit "Sync now" action call this.
 */
export async function syncBotCalls(bot: DograhProvisionableBot, supabase: SupabaseClient): Promise<SyncResult> {
  const workflowIds = [bot.dograh_workflow_id, bot.dograh_outbound_workflow_id].filter(
    (id): id is string => Boolean(id)
  );

  let ingested = 0;
  let failed = 0;

  for (const workflowId of workflowIds) {
    const runs = await listRuns(workflowId);

    for (const runSummary of runs) {
      if (!runSummary.is_completed) continue;

      try {
        const wasIngested = await ingestRun(bot, workflowId, runSummary.id, supabase);
        if (wasIngested) ingested += 1;
      } catch (err) {
        failed += 1;
        console.error(`[phone-calls] Failed to ingest Dograh run ${runSummary.id} for bot ${bot.id}:`, err);
        await supabase
          .from('phone_calls')
          .update({ ingest_status: 'failed' })
          .eq('dograh_run_id', String(runSummary.id));
      }
    }
  }

  return { ingested, failed };
}

async function ingestRun(
  bot: DograhProvisionableBot,
  workflowId: string,
  runId: number,
  supabase: SupabaseClient
): Promise<boolean> {
  const dograhRunId = String(runId);

  // 1. Claim. `on conflict do nothing` semantics via insert-then-fetch-on-conflict, since
  // dograh_run_id is unique. session_id is left null — the claim precedes the session.
  let callRow: any;
  const { data: inserted, error: insertError } = await supabase
    .from('phone_calls')
    .insert({
      dograh_run_id: dograhRunId,
      bot_id: bot.id,
      dograh_workflow_id: workflowId,
      ingest_status: 'pending',
    })
    .select()
    .single();

  if (insertError) {
    const { data: existing, error: fetchError } = await supabase
      .from('phone_calls')
      .select('*')
      .eq('dograh_run_id', dograhRunId)
      .single();
    if (fetchError || !existing) throw insertError;
    callRow = existing;
  } else {
    callRow = inserted;
  }

  if (callRow.ingest_status === 'done') return false;

  // 2. Bind the session immediately — before inserting messages — so a crash after this point
  // resumes onto the same session instead of creating a duplicate.
  let sessionId: string = callRow.session_id;
  if (!sessionId) {
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .insert({ bot_id: bot.id, channel: 'phone' })
      .select()
      .single();
    if (sessionError || !session) throw sessionError || new Error('Failed to create chat session for phone call');
    sessionId = session.id;

    const { error: bindError } = await supabase
      .from('phone_calls')
      .update({ session_id: sessionId })
      .eq('id', callRow.id);
    if (bindError) throw bindError;
  }

  // 3. Populate transcript + lead analysis.
  const run = await getRun(workflowId, runId);
  // Use the absolute, downloadable URL — run.transcript_url is a relative storage key that
  // throws when fetched. This was the bug that silently failed every call that had a transcript.
  const transcriptUrl = run.transcript_public_url || run.transcript_url;
  const recordingUrl = run.recording_public_url || run.recording_url;
  let transcript = '';
  if (transcriptUrl) {
    const raw = await fetchTranscript(transcriptUrl);
    const turns = parseTranscript(raw);
    if (turns.length > 0) {
      await supabase.from('messages').insert(
        turns.map(turn => ({ session_id: sessionId, sender: turn.sender, content: turn.content }))
      );
      transcript = turns
        .map(turn => `${turn.sender === 'user' ? 'Visitor' : 'Receptionist'}: ${turn.content}`)
        .join('\n');
    }
  }

  if (transcript) {
    await analyzeLead({ sessionId, botId: bot.id, transcript }, supabase);
  }

  // 4. Finalize.
  const { error: finalizeError } = await supabase
    .from('phone_calls')
    .update({
      caller_number: extractCounterpartyNumber(run),
      status: run.is_completed ? 'completed' : 'in_progress',
      duration_seconds: extractDurationSeconds(run),
      recording_url: recordingUrl,
      transcript_url: transcriptUrl,
      cost_info: run.cost_info,
      started_at: run.created_at,
      ingest_status: 'done',
    })
    .eq('id', callRow.id);
  if (finalizeError) throw finalizeError;

  return true;
}
