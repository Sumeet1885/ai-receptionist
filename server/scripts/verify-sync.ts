import 'dotenv/config';
import { supabase } from '../src/services/db';
import { syncBotCalls } from '../src/modules/phone-calls/callMirror';
import { DograhProvisionableBot } from '../src/modules/phone-calls/types';

// The real bot under test (Yash Chandnani): inbound workflow 4, outbound workflow 5.
const bot: DograhProvisionableBot = {
  id: '4d7aac5d-b7cb-4ca4-9892-b2d4a72ee71d',
  owner_id: '',
  business_name: 'Yash Chandnani',
  industry: 'Education',
  knowledge_base: '',
  dograh_workflow_id: '4',
  dograh_outbound_workflow_id: '5',
};

async function main() {
  // Reset the previously-failed rows so the fix gets a clean re-attempt (claim-first resume
  // will reuse their existing sessions). Done rows with real content are left alone.
  const { data: reset } = await supabase
    .from('phone_calls')
    .update({ ingest_status: 'pending' })
    .eq('bot_id', bot.id)
    .eq('ingest_status', 'failed')
    .select('dograh_run_id');
  console.log('reset failed->pending:', (reset || []).map((r: any) => r.dograh_run_id));

  console.log('--- running syncBotCalls ---');
  const result = await syncBotCalls(bot, supabase);
  console.log('sync result:', result);

  // Verify outcome: messages + leads now exist, statuses, counterparty numbers.
  const { data: calls } = await supabase
    .from('phone_calls')
    .select('dograh_run_id, ingest_status, caller_number, duration_seconds, transcript_url, recording_url, session_id')
    .eq('bot_id', bot.id)
    .order('created_at', { ascending: false })
    .limit(8);
  console.log('--- recent phone_calls after sync ---');
  for (const c of calls || []) {
    console.log(JSON.stringify(c));
  }

  const sessionIds = (calls || []).map((c: any) => c.session_id).filter(Boolean);
  const { count: msgCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .in('session_id', sessionIds);
  const { count: leadCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .in('session_id', sessionIds);
  console.log(`messages for these sessions: ${msgCount}, leads: ${leadCount}`);

  // Idempotency: run again, expect 0 newly ingested.
  console.log('--- second syncBotCalls (idempotency check) ---');
  const second = await syncBotCalls(bot, supabase);
  console.log('second sync result (expect ingested 0):', second);
}

main().then(() => process.exit(0)).catch(err => { console.error('FAILED:', err); process.exit(1); });
