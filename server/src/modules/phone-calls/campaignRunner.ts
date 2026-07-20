import { SupabaseClient } from '@supabase/supabase-js';
import { initiateCall } from './dograhClient';
import { DograhProvisionableBot } from './types';

// ── In-memory state ─────────────────────────────────────────────────────────
// Maps campaignId → NodeJS.Timeout handle for the currently-scheduled next-call
const activeCampaigns = new Map<string, NodeJS.Timeout>();

// Per-bot campaign-mode hourly tracking (independent of the single-dial limit)
const campaignCallTimestamps = new Map<string, number[]>();

// ── Constants ────────────────────────────────────────────────────────────────
const COOLDOWN_MS = 10_000;                  // 10 seconds — fixed per user preference
const DEFAULT_HOURLY_CAP = 100;             // higher default for campaign mode (bot-level is 20)
const MAX_HOURLY_CAP = 500;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Starts (or resumes) a campaign loop. Safe to call multiple times — a
 * running campaign will not be double-started.
 */
export function startCampaign(
  campaignId: string,
  bot: DograhProvisionableBot,
  hourlyCap: number | null,
  supabase: SupabaseClient,
): void {
  if (activeCampaigns.has(campaignId)) {
    console.log(`[campaign] Campaign ${campaignId} already running — skipping start.`);
    return;
  }

  const cap = Math.min(hourlyCap ?? DEFAULT_HOURLY_CAP, MAX_HOURLY_CAP);
  console.log(`[campaign] Starting campaign ${campaignId} (hourly cap: ${cap}).`);
  void advanceLoop(campaignId, bot, cap, supabase);
}

/**
 * Stops the in-memory loop for a campaign (does not mark DB status — callers do that).
 */
export function stopCampaign(campaignId: string): void {
  const handle = activeCampaigns.get(campaignId);
  if (handle) {
    clearTimeout(handle);
    activeCampaigns.delete(campaignId);
    console.log(`[campaign] Campaign ${campaignId} stopped.`);
  }
}

/**
 * Returns true if the campaign loop is active in this process.
 */
export function isCampaignRunning(campaignId: string): boolean {
  return activeCampaigns.has(campaignId);
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function advanceLoop(
  campaignId: string,
  bot: DograhProvisionableBot,
  hourlyCap: number,
  supabase: SupabaseClient,
): Promise<void> {
  // Remove any stale handle before doing work
  activeCampaigns.delete(campaignId);

  // 1. Confirm campaign is still 'running' in DB
  const { data: campaign } = await supabase
    .from('call_campaigns')
    .select('id, status, bot_id')
    .eq('id', campaignId)
    .single();

  if (!campaign || campaign.status !== 'running') {
    console.log(`[campaign] Campaign ${campaignId} is no longer running — loop exits.`);
    return;
  }

  // 2. Enforce hourly cap (campaign-mode tracking, separate from single-dial tracking)
  const rateLimitError = checkCampaignRateLimit(bot.id, hourlyCap);
  if (rateLimitError) {
    console.warn(`[campaign] Campaign ${campaignId} rate-limited: ${rateLimitError}`);
    // Pause campaign and schedule resume at start of next hour window
    await pauseForRateLimit(campaignId, supabase);
    return;
  }

  // 3. Pick next pending contact
  const { data: contact } = await supabase
    .from('campaign_contacts')
    .select('id, phone_number, name, extra_data')
    .eq('campaign_id', campaignId)
    .eq('call_status', 'pending')
    .order('row_index', { ascending: true })
    .limit(1)
    .single();

  if (!contact) {
    // No more pending contacts — campaign complete
    await supabase
      .from('call_campaigns')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', campaignId);
    console.log(`[campaign] Campaign ${campaignId} completed.`);
    return;
  }

  // 4. Mark contact as 'calling' and record timestamp
  const calledAt = new Date().toISOString();
  await supabase
    .from('campaign_contacts')
    .update({ call_status: 'calling', called_at: calledAt })
    .eq('id', contact.id);

  // 5. Place the call
  try {
    await initiateCall({
      workflowId: bot.dograh_outbound_workflow_id!,
      phoneNumber: contact.phone_number,
      telephonyConfigId: bot.dograh_telephony_config_id!,
      fromPhoneNumberId: bot.dograh_phone_number_id!,
      // Embed campaign_contact_id in initial_context so the poller can match
      // the Dograh run back to this contact row reliably.
      initialContext: {
        campaign_contact_id: contact.id,
        campaign_id: campaignId,
        contact_name: contact.name ?? '',
      },
    });

    console.log(`[campaign] Placed call for contact ${contact.id} (${contact.phone_number}) in campaign ${campaignId}.`);

    // Increment called_count
    await supabase.rpc('increment_campaign_called_count', { campaign_id_arg: campaignId });

  } catch (err: any) {
    console.error(`[campaign] Failed to call contact ${contact.id}:`, err.message);
    await supabase
      .from('campaign_contacts')
      .update({ call_status: 'failed', error_message: err.message || 'Call placement failed' })
      .eq('id', contact.id);

    // Still advance after failure — don't stall the entire campaign on one bad number
  }

  // 6. Schedule next call after cooldown
  const handle = setTimeout(() => {
    activeCampaigns.delete(campaignId);
    void advanceLoop(campaignId, bot, hourlyCap, supabase);
  }, COOLDOWN_MS);
  activeCampaigns.set(campaignId, handle);
}

function checkCampaignRateLimit(botId: string, hourlyCap: number): string | null {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const key = `campaign:${botId}`;
  const recent = (campaignCallTimestamps.get(key) ?? []).filter(ts => ts > hourAgo);

  if (recent.length >= hourlyCap) {
    return `Campaign hourly cap of ${hourlyCap} reached.`;
  }

  recent.push(now);
  campaignCallTimestamps.set(key, recent);
  return null;
}

async function pauseForRateLimit(campaignId: string, supabase: SupabaseClient): Promise<void> {
  await supabase
    .from('call_campaigns')
    .update({ status: 'paused' })
    .eq('id', campaignId);

  // Auto-resume after the current hour window resets (at most 60 minutes)
  const msUntilNextHour = 60 * 60 * 1000 - (Date.now() % (60 * 60 * 1000));
  console.log(`[campaign] Campaign ${campaignId} paused for rate limit. Auto-resume in ${Math.round(msUntilNextHour / 1000)}s.`);

  const handle = setTimeout(async () => {
    activeCampaigns.delete(campaignId);
    const { data } = await supabase.from('call_campaigns').select('bot_id, hourly_cap_override').eq('id', campaignId).single();
    if (!data) return;
    const { data: bot } = await supabase.from('bots').select('*').eq('id', data.bot_id).single();
    if (!bot) return;

    await supabase.from('call_campaigns').update({ status: 'running' }).eq('id', campaignId);
    const cap = Math.min(data.hourly_cap_override ?? DEFAULT_HOURLY_CAP, MAX_HOURLY_CAP);
    void advanceLoop(campaignId, bot, cap, supabase);
  }, msUntilNextHour + 5000); // +5s buffer

  activeCampaigns.set(campaignId, handle);
}
