import { SupabaseClient } from '@supabase/supabase-js';

export async function syncCampaignResults(supabase: SupabaseClient): Promise<void> {
  const { data: contacts, error } = await supabase
    .from('campaign_contacts')
    .select('id, campaign_id, phone_number, called_at, phone_call_id, call_status')
    .eq('call_status', 'calling')
    .is('phone_call_id', null)
    .limit(100);

  if (error) {
    console.error('[campaignSync] Error fetching unlinked contacts:', error);
  } else if (contacts && contacts.length > 0) {
    for (const contact of contacts) {
      try {
        if (!contact.called_at) continue;

        const since = new Date(new Date(contact.called_at).getTime() - 5 * 60 * 1000).toISOString();
        const { data: matchedCalls } = await supabase
          .from('phone_calls')
          .select('id, session_id, ingest_status, duration_seconds, status')
          .eq('caller_number', contact.phone_number)
          .gte('started_at', since)
          .order('started_at', { ascending: false });

        if (!matchedCalls || matchedCalls.length === 0) continue;

        let bestCall = null;
        for (const call of matchedCalls) {
          const { data: alreadyLinked } = await supabase
            .from('campaign_contacts')
            .select('id')
            .eq('phone_call_id', call.id)
            .maybeSingle();

          if (!alreadyLinked) {
            bestCall = call;
            break;
          }
        }

        if (!bestCall) continue;

        console.warn(
          `[campaignSync] FALLBACK match used for contact ${contact.id} ` +
          `(phone: ${contact.phone_number}) → phone_call ${bestCall.id}. `
        );

        await supabase
          .from('campaign_contacts')
          .update({ phone_call_id: bestCall.id, session_id: bestCall.session_id })
          .eq('id', contact.id);

      } catch (err) {
        console.error(`[campaignSync] Error linking contact ${contact.id} via fallback:`, err);
      }
    }
  }

  const { data: linked, error: linkedErr } = await supabase
    .from('campaign_contacts')
    .select('id, campaign_id, phone_call_id, session_id, call_status')
    .eq('call_status', 'calling')
    .not('phone_call_id', 'is', null)
    .limit(100);

  if (!linkedErr && linked && linked.length > 0) {
    for (const contact of linked) {
      try {
        const { data: call } = await supabase
          .from('phone_calls')
          .select('id, ingest_status, duration_seconds, session_id, transcript_url, recording_url')
          .eq('id', contact.phone_call_id)
          .single();

        if (!call) continue;

        if (call.ingest_status === 'failed') {
          await supabase
            .from('campaign_contacts')
            .update({
              call_status: 'failed',
              error_message: 'Call ingestion failed',
              lead_score: 'NO_ANSWER',
              call_summary: 'User was not available to connect / Call not picked up',
            })
            .eq('id', contact.id);
          continue;
        }

        if (call.ingest_status !== 'done') continue;

        let summary: string | null = null;
        let leadScore: string | null = null;
        const sessionId = call.session_id ?? contact.session_id;
        const duration = call.duration_seconds ?? 0;

        if (duration === 0) {
          leadScore = 'Unavailable';
          summary = 'The User did not pickup or was unavailiable to Pick up';
        } else {
          if (sessionId) {
            const { data: lead } = await supabase
              .from('leads')
              .select('summary, lead_score')
              .eq('session_id', sessionId)
              .maybeSingle();

            summary = lead?.summary ?? null;
            leadScore = lead?.lead_score ?? null;
          }

          if (!leadScore || !summary) {
            let hasMessages = false;
            if (sessionId) {
              const { count, error: countErr } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('session_id', sessionId);
              if (!countErr && count && count > 0) {
                hasMessages = true;
              }
            }

            const isConnected = duration > 0 || hasMessages || Boolean(call.transcript_url) || Boolean(call.recording_url);

            if (!leadScore) {
              leadScore = isConnected ? 'HANGUP' : 'NO_ANSWER';
            }
            if (!summary) {
              summary = isConnected
                ? 'User hung up / Call was hung up'
                : 'User was not available to connect / Call not picked up';
            }
          }
        }

        const statusValue = duration > 0 ? 'done' : 'not_pickup';

        await supabase
          .from('campaign_contacts')
          .update({
            call_status: statusValue,
            call_summary: summary,
            lead_score: leadScore,
            call_duration: duration,
          })
          .eq('id', contact.id);

        await supabase.rpc('increment_campaign_called_count', { campaign_id_arg: contact.campaign_id });

      } catch (err) {
        console.error(`[campaignSync] Error processing linked contact ${contact.id}:`, err);
      }
    }
  }

  try {
    const { data: activeCampaigns } = await supabase
      .from('call_campaigns')
      .select('id, status')
      .in('status', ['running', 'paused']);

    if (activeCampaigns && activeCampaigns.length > 0) {
      for (const campaign of activeCampaigns) {
        const { count, error: countErr } = await supabase
          .from('campaign_contacts')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .in('call_status', ['pending', 'calling']);

        if (!countErr && count === 0) {
          await supabase
            .from('call_campaigns')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', campaign.id);
        }
      }
    }
  } catch (err) {
    console.error('[campaignSync] Error checking campaign completion:', err);
  }
}
