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
        const { data: matchedCall } = await supabase
          .from('phone_calls')
          .select('id, session_id, ingest_status, duration_seconds, status')
          .eq('caller_number', contact.phone_number)
          .gte('started_at', since)
          .order('started_at', { ascending: true })
          .limit(1)
          .single();

        if (!matchedCall) continue;

        console.warn(
          `[campaignSync] FALLBACK match used for contact ${contact.id} ` +
          `(phone: ${contact.phone_number}) → phone_call ${matchedCall.id}. `
        );

        await supabase
          .from('campaign_contacts')
          .update({ phone_call_id: matchedCall.id, session_id: matchedCall.session_id })
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

  if (linkedErr || !linked || linked.length === 0) return;

  for (const contact of linked) {
    try {
      const { data: call } = await supabase
        .from('phone_calls')
        .select('id, ingest_status, duration_seconds, session_id')
        .eq('id', contact.phone_call_id)
        .single();

      if (!call) continue;

      if (call.ingest_status === 'failed') {
        await supabase
          .from('campaign_contacts')
          .update({
            call_status: 'failed',
            error_message: 'Call ingestion failed'
          })
          .eq('id', contact.id);
        continue;
      }

      if (call.ingest_status !== 'done') continue;

      let summary: string | null = null;
      let leadScore: string | null = null;
      const sessionId = call.session_id ?? contact.session_id;

      if (sessionId) {
        const { data: lead } = await supabase
          .from('leads')
          .select('summary, lead_score')
          .eq('session_id', sessionId)
          .maybeSingle();

        summary = lead?.summary ?? null;
        leadScore = lead?.lead_score ?? null;
      }

      await supabase
        .from('campaign_contacts')
        .update({
          call_status: 'done',
          call_summary: summary,
          lead_score: leadScore,
          call_duration: call.duration_seconds,
        })
        .eq('id', contact.id);

      await supabase.rpc('increment_campaign_called_count', { campaign_id_arg: contact.campaign_id });

    } catch (err) {
      console.error(`[campaignSync] Error processing linked contact ${contact.id}:`, err);
    }
  }
}
