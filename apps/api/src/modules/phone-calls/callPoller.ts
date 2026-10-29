import { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config';
import { isDograhConfigured } from './dograhClient';
import { syncBotCalls } from './callMirror';
import { DograhProvisionableBot } from './types';
import { restoreExpiredInboundCapacityWorkflows } from './inboundRateLimiter';
import { syncCampaignResults } from './campaignSync';

let pollTimer: NodeJS.Timeout | null = null;

async function pollOnce(supabase: SupabaseClient): Promise<void> {
  try {
    await restoreExpiredInboundCapacityWorkflows(supabase);
  } catch (err: any) {
    console.warn('[phone-calls] Inbound capacity workflow restore skipped:', err?.message || err);
  }

  const { data: bots, error } = await supabase
    .from('bots')
    .select('id, owner_id, business_name, industry, knowledge_base, dograh_workflow_id, dograh_outbound_workflow_id, dograh_telephony_config_id, dograh_phone_number_id, dograh_phone_number')
    .not('dograh_workflow_id', 'is', null);

  if (error) {
    console.error('[phone-calls] Poller failed to list provisioned bots:', error);
    return;
  }

    for (const bot of (bots || []) as DograhProvisionableBot[]) {
      try {
        await syncBotCalls(bot, supabase);
      } catch (err: any) {
        if (err?.message?.includes('unreachable') || err?.message?.includes('fetch failed')) {
          console.warn('[phone-calls] Dograh voice platform unreachable; skipping background sync.');
          break;
        }
        console.error(`[phone-calls] Poller sync failed for bot ${bot.id}:`, err?.message || err);
      }
    }

  try {
    await syncCampaignResults(supabase);
  } catch (err) {
    console.error('[phone-calls] Campaign result sync failed:', err);
  }
}


export function startCallPoller(supabase: SupabaseClient): void {
  if (!isDograhConfigured()) {
    console.log('[phone-calls] Dograh not configured; call poller not started.');
    return;
  }
  if (pollTimer) return;

  pollTimer = setInterval(() => {
    pollOnce(supabase).catch(err => {
      console.warn('[phone-calls] Call poller cycle failed:', err?.message || err);
    });
  }, config.dograh.pollIntervalMs);

  console.log(`[phone-calls] Call poller started (every ${config.dograh.pollIntervalMs}ms).`);
}

export function stopCallPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
