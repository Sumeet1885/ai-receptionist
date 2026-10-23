import { SupabaseClient } from '@supabase/supabase-js';
import { initiateCall } from './dograhClient';
import { DograhProvisionableBot } from './types';
import { logger } from '../../services/cloudwatchLogger';
import { registerOutboundCall } from './outboundTracker';
import { prepareOutboundWorkflowForContact } from './dograhController';

function maskPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return '****';
  if (phoneNumber.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, phoneNumber.length - 4))}${phoneNumber.slice(-4)}`;
}

const activeCampaigns = new Map<string, NodeJS.Timeout>();

const campaignCallTimestamps = new Map<string, number[]>();

const COOLDOWN_MS = 10_000;
const DEFAULT_HOURLY_CAP = 100;
const MAX_HOURLY_CAP = 500;

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
  logger.aiReceptionist('Outbound campaign started', {
    campaignId,
    botId: bot.id,
    hourlyCap: cap,
  });
  void advanceLoop(campaignId, bot, cap, supabase);
}


export function stopCampaign(campaignId: string): void {
  const handle = activeCampaigns.get(campaignId);
  if (handle) {
    clearTimeout(handle);
    activeCampaigns.delete(campaignId);
    console.log(`[campaign] Campaign ${campaignId} stopped.`);
    logger.aiReceptionist('Outbound campaign stopped', { campaignId });
  }
}



export function isCampaignRunning(campaignId: string): boolean {
  return activeCampaigns.has(campaignId);
}

async function advanceLoop(
  campaignId: string,
  bot: DograhProvisionableBot,
  hourlyCap: number,
  supabase: SupabaseClient,
): Promise<void> {
  activeCampaigns.delete(campaignId);

  const { data: campaign } = await supabase
    .from('call_campaigns')
    .select('id, status, bot_id')
    .eq('id', campaignId)
    .single();

  if (!campaign || campaign.status !== 'running') {
    console.log(`[campaign] Campaign ${campaignId} is no longer running — loop exits.`);
    return;
  }

  const rateLimitError = checkCampaignRateLimit(bot.id, hourlyCap);
  if (rateLimitError) {
    console.warn(`[campaign] Campaign ${campaignId} rate-limited: ${rateLimitError}`);
    await pauseForRateLimit(campaignId, supabase);
    return;
  }

  const { data: contact } = await supabase
    .from('campaign_contacts')
    .select('id, phone_number, name, extra_data')
    .eq('campaign_id', campaignId)
    .eq('call_status', 'pending')
    .order('row_index', { ascending: true })
    .limit(1)
    .single();

  if (!contact) {
    const { count, error: countErr } = await supabase
      .from('campaign_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('call_status', 'calling');

    if (!countErr && count === 0) {
      await supabase
        .from('call_campaigns')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', campaignId);
      logger.aiReceptionist('Outbound campaign completed', { campaignId });
    } else {
    }
    return;
  }

  const calledAt = new Date().toISOString();
  await supabase
    .from('campaign_contacts')
    .update({ call_status: 'calling', called_at: calledAt })
    .eq('id', contact.id);

  try {
    const outboundConfigId = (bot as any).widget_config?.outboundTelephony?.telephonyConfigId || bot.dograh_telephony_config_id!;
    const outboundNumberId = (bot as any).widget_config?.outboundTelephony?.phoneNumberId || bot.dograh_phone_number_id!;

    if (bot.dograh_outbound_workflow_id) {
      await prepareOutboundWorkflowForContact(bot, contact.name || undefined);
    }

    await initiateCall({
      workflowId: bot.dograh_outbound_workflow_id!,
      phoneNumber: contact.phone_number,
      telephonyConfigId: outboundConfigId,
      fromPhoneNumberId: outboundNumberId,
      
      initialContext: {
        campaign_contact_id: contact.id,
        campaign_id: campaignId,
        contact_name: contact.name ?? '',
        customer_name: contact.name ?? '',
        name: contact.name ?? '',
      },
    });

    registerOutboundCall({
      botId: bot.id,
      phoneNumber: contact.phone_number,
      contactName: contact.name || undefined,
      sessionId: '',
    });

    console.log(`[campaign] Placed call for contact ${contact.id} (${contact.phone_number}) in campaign ${campaignId}.`);
    logger.callEvent('campaign_call_placed', {
      campaignId,
      botId: bot.id,
      contactId: contact.id,
      phoneNumber: maskPhoneNumber(contact.phone_number),
    });

    await supabase.rpc('increment_campaign_called_count', { campaign_id_arg: campaignId });

  } catch (err: any) {
    console.error(`[campaign] Failed to call contact ${contact.id}:`, err.message);
    logger.callEvent('campaign_call_failed', {
      campaignId,
      botId: bot.id,
      contactId: contact.id,
      phoneNumber: maskPhoneNumber(contact.phone_number),
      error: err.message,
    }, 'error');
    await supabase
      .from('campaign_contacts')
      .update({
        call_status: 'failed',
        error_message: err.message || 'Call placement failed',
        lead_score: 'NO_ANSWER',
        call_summary: 'User was not available to connect / Call not picked up',
      })
      .eq('id', contact.id);

  }

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

  const msUntilNextHour = 60 * 60 * 1000 - (Date.now() % (60 * 60 * 1000));
  console.log(`[campaign] Campaign ${campaignId} paused for rate limit. Auto-resume in ${Math.round(msUntilNextHour / 1000)}s.`);
  logger.aiReceptionist('Outbound campaign paused for rate limit', {
    campaignId,
    resumeInSeconds: Math.round(msUntilNextHour / 1000),
  }, 'warn');

  const handle = setTimeout(async () => {
    activeCampaigns.delete(campaignId);
    const { data } = await supabase.from('call_campaigns').select('bot_id, hourly_cap_override').eq('id', campaignId).single();
    if (!data) return;
    const { data: bot } = await supabase.from('bots').select('*').eq('id', data.bot_id).single();
    if (!bot) return;

    await supabase.from('call_campaigns').update({ status: 'running' }).eq('id', campaignId);
    const cap = Math.min(data.hourly_cap_override ?? DEFAULT_HOURLY_CAP, MAX_HOURLY_CAP);
    void advanceLoop(campaignId, bot, cap, supabase);
  }, msUntilNextHour + 5000); 

  activeCampaigns.set(campaignId, handle);
}
