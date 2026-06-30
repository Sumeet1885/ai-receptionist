import { SupabaseClient } from '@supabase/supabase-js';
import { assignInboundWorkflow, isDograhConfigured } from './dograhClient';

export const DEFAULT_INBOUND_COOLDOWN_SECONDS = 10;
export const DEFAULT_INBOUND_HOURLY_CAP = 20;
const ONE_HOUR_MS = 60 * 60 * 1000;
const restoreTimers = new Map<string, NodeJS.Timeout>();

export interface ComputeInboundCapacityUntilOptions {
  now: Date;
  cooldownSeconds: number;
  hourlyCap: number;
  recentAttemptTimes: Date[];
}

export interface InboundRateLimitBot {
  id: string;
  dograh_workflow_id?: string | null;
  dograh_capacity_workflow_id?: string | null;
  dograh_telephony_config_id?: string | null;
  dograh_phone_number_id?: string | null;
  dograh_inbound_cooldown_seconds?: number | null;
  dograh_inbound_hourly_cap?: number | null;
  dograh_inbound_active_workflow?: 'normal' | 'capacity' | string | null;
  dograh_inbound_rate_limited_until?: string | null;
}

export function computeInboundCapacityUntil(options: ComputeInboundCapacityUntilOptions): Date | null {
  const { now, cooldownSeconds, hourlyCap } = options;
  const candidates: number[] = [];

  if (cooldownSeconds > 0 && options.recentAttemptTimes.length > 0) {
    candidates.push(now.getTime() + cooldownSeconds * 1000);
  }

  if (hourlyCap > 0) {
    const hourAgo = now.getTime() - ONE_HOUR_MS;
    const recent = options.recentAttemptTimes
      .map(date => date.getTime())
      .filter(timestamp => timestamp > hourAgo && timestamp <= now.getTime())
      .sort((a, b) => a - b);

    if (recent.length >= hourlyCap) {
      candidates.push(recent[recent.length - hourlyCap] + ONE_HOUR_MS);
    }
  }

  const until = Math.max(...candidates.filter(timestamp => timestamp > now.getTime()));
  return Number.isFinite(until) ? new Date(until) : null;
}

function shouldUseCapacityWorkflow(bot: InboundRateLimitBot, until: Date | null): boolean {
  return Boolean(
    until &&
    bot.dograh_capacity_workflow_id &&
    bot.dograh_telephony_config_id &&
    bot.dograh_phone_number_id
  );
}

async function setInboundWorkflow(
  supabase: SupabaseClient,
  bot: InboundRateLimitBot,
  workflowId: string,
  activeWorkflow: 'normal' | 'capacity',
  rateLimitedUntil: Date | null
): Promise<void> {
  if (!bot.dograh_telephony_config_id || !bot.dograh_phone_number_id) return;

  await assignInboundWorkflow(bot.dograh_telephony_config_id, bot.dograh_phone_number_id, workflowId);

  const { error } = await supabase
    .from('bots')
    .update({
      dograh_inbound_active_workflow: activeWorkflow,
      dograh_inbound_rate_limited_until: rateLimitedUntil ? rateLimitedUntil.toISOString() : null,
    })
    .eq('id', bot.id);

  if (error) throw error;
}

function scheduleRestore(supabase: SupabaseClient, botId: string, until: Date): void {
  const existing = restoreTimers.get(botId);
  if (existing) clearTimeout(existing);

  const delayMs = Math.max(250, until.getTime() - Date.now() + 250);
  const timer = setTimeout(() => {
    restoreTimers.delete(botId);
    void restoreExpiredInboundCapacityWorkflows(supabase).catch(err => {
      console.error(`[phone-calls] Scheduled inbound workflow restore failed for bot ${botId}:`, err);
    });
  }, Math.min(delayMs, 2_147_000_000));
  timer.unref?.();
  restoreTimers.set(botId, timer);
}

export async function markInboundAttemptAndApplyLimit(
  supabase: SupabaseClient,
  bot: InboundRateLimitBot,
  now = new Date()
): Promise<{ capacityUntil: Date | null; switchedToCapacity: boolean }> {
  const cooldownSeconds = bot.dograh_inbound_cooldown_seconds ?? DEFAULT_INBOUND_COOLDOWN_SECONDS;
  const hourlyCap = bot.dograh_inbound_hourly_cap ?? DEFAULT_INBOUND_HOURLY_CAP;

  const { error: insertError } = await supabase
    .from('phone_call_attempts')
    .insert({ bot_id: bot.id, direction: 'inbound', created_at: now.toISOString() });
  if (insertError) throw insertError;

  const hourAgo = new Date(now.getTime() - ONE_HOUR_MS).toISOString();
  const { data, error: selectError } = await supabase
    .from('phone_call_attempts')
    .select('created_at')
    .eq('bot_id', bot.id)
    .eq('direction', 'inbound')
    .gte('created_at', hourAgo)
    .order('created_at', { ascending: true });
  if (selectError) throw selectError;

  const capacityUntil = computeInboundCapacityUntil({
    now,
    cooldownSeconds,
    hourlyCap,
    recentAttemptTimes: (data || []).map((row: any) => new Date(row.created_at)),
  });

  if (shouldUseCapacityWorkflow(bot, capacityUntil)) {
    await setInboundWorkflow(
      supabase,
      bot,
      bot.dograh_capacity_workflow_id!,
      'capacity',
      capacityUntil
    );
    scheduleRestore(supabase, bot.id, capacityUntil!);
    return { capacityUntil, switchedToCapacity: true };
  }

  return { capacityUntil, switchedToCapacity: false };
}

export async function restoreExpiredInboundCapacityWorkflows(
  supabase: SupabaseClient,
  now = new Date()
): Promise<{ restored: number }> {
  if (!isDograhConfigured()) return { restored: 0 };

  const { data, error } = await supabase
    .from('bots')
    .select(
      'id, dograh_workflow_id, dograh_capacity_workflow_id, dograh_telephony_config_id, dograh_phone_number_id, dograh_inbound_active_workflow, dograh_inbound_rate_limited_until'
    )
    .eq('dograh_inbound_active_workflow', 'capacity')
    .not('dograh_workflow_id', 'is', null)
    .not('dograh_telephony_config_id', 'is', null)
    .not('dograh_phone_number_id', 'is', null)
    .lte('dograh_inbound_rate_limited_until', now.toISOString());

  if (error) {
    console.error('[phone-calls] Failed to list expired inbound capacity workflows:', error);
    return { restored: 0 };
  }

  let restored = 0;
  for (const bot of (data || []) as InboundRateLimitBot[]) {
    if (!bot.dograh_workflow_id) continue;
    try {
      await setInboundWorkflow(supabase, bot, bot.dograh_workflow_id, 'normal', null);
      const timer = restoreTimers.get(bot.id);
      if (timer) {
        clearTimeout(timer);
        restoreTimers.delete(bot.id);
      }
      restored += 1;
    } catch (err) {
      console.error(`[phone-calls] Failed to restore inbound workflow for bot ${bot.id}:`, err);
    }
  }

  return { restored };
}
