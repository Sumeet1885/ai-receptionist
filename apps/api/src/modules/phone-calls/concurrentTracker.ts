import { supabase } from '../../services/db';

interface ActiveCall {
  key: string;
  ownerId: string;
  botId: string;
  direction: 'inbound' | 'outbound';
  startedAt: number;
  sessionId?: string;
  campaignContactId?: string;
}

// In-memory registry with a 15-minute fallback timeout (max call duration is 10-15 mins)
const activeCalls = new Map<string, ActiveCall>();
const MAX_CALL_TIMEOUT_MS = 15 * 60 * 1000;

export function trackCallStart(params: {
  key: string;
  ownerId: string;
  botId: string;
  direction: 'inbound' | 'outbound';
  sessionId?: string;
  campaignContactId?: string;
}): void {
  // Prune any stale calls older than 15 minutes
  const now = Date.now();
  for (const [k, call] of activeCalls.entries()) {
    if (now - call.startedAt > MAX_CALL_TIMEOUT_MS) {
      activeCalls.delete(k);
    }
  }

  activeCalls.set(params.key, {
    key: params.key,
    ownerId: params.ownerId,
    botId: params.botId,
    direction: params.direction,
    startedAt: now,
    sessionId: params.sessionId,
    campaignContactId: params.campaignContactId,
  });
}

export function trackCallEnd(keyOrIdentifier: string): void {
  if (!keyOrIdentifier) return;
  // 1. Direct key delete
  activeCalls.delete(keyOrIdentifier);

  // 2. Clear any matching active call by sessionId, campaignContactId, or key
  for (const [k, call] of activeCalls.entries()) {
    if (
      call.key === keyOrIdentifier ||
      call.sessionId === keyOrIdentifier ||
      call.campaignContactId === keyOrIdentifier
    ) {
      activeCalls.delete(k);
    }
  }
}

export async function getActiveCallsCount(ownerId: string): Promise<number> {
  const now = Date.now();
  // 1. In-memory active calls
  const activeMemoryKeys = new Set<string>();
  for (const [k, call] of activeCalls.entries()) {
    if (now - call.startedAt > MAX_CALL_TIMEOUT_MS) {
      activeCalls.delete(k);
    } else if (call.ownerId === ownerId) {
      activeMemoryKeys.add(call.sessionId || call.key);
    }
  }

  try {
    const fifteenMinsAgo = new Date(now - MAX_CALL_TIMEOUT_MS).toISOString();

    // 2. Fetch all bots owned by this user
    const { data: bots, error: botsErr } = await supabase
      .from('bots')
      .select('id')
      .eq('owner_id', ownerId);

    if (botsErr || !bots || bots.length === 0) {
      return activeMemoryKeys.size;
    }

    const botIds = bots.map((b) => b.id);
    const activeDbIdentifiers = new Set<string>();

    // 3. Persistent check: Campaign contacts currently in 'calling' state (survives server restarts)
    const { data: campaigns } = await supabase
      .from('call_campaigns')
      .select('id')
      .in('bot_id', botIds);

    if (campaigns && campaigns.length > 0) {
      const campaignIds = campaigns.map((c) => c.id);
      const { data: activeContacts } = await supabase
        .from('campaign_contacts')
        .select('id, campaign_id')
        .in('campaign_id', campaignIds)
        .eq('call_status', 'calling')
        .gte('called_at', fifteenMinsAgo);

      if (activeContacts) {
        for (const c of activeContacts) {
          activeDbIdentifiers.add(`campaign_${c.campaign_id}_${c.id}`);
        }
      }
    }

    // 4. Persistent check: Active phone sessions in chat_sessions not yet finalized in phone_calls
    const { data: activeSessions } = await supabase
      .from('chat_sessions')
      .select('id')
      .in('bot_id', botIds)
      .eq('channel', 'phone')
      .is('ended_at', null)
      .gte('started_at', fifteenMinsAgo);

    if (activeSessions && activeSessions.length > 0) {
      const sessionIds = activeSessions.map((s) => s.id);
      const { data: completedCalls } = await supabase
        .from('phone_calls')
        .select('session_id')
        .in('session_id', sessionIds)
        .or('ingest_status.eq.done,status.eq.completed');

      const completedSessionIds = new Set((completedCalls || []).map((c) => c.session_id));
      for (const s of activeSessions) {
        if (!completedSessionIds.has(s.id)) {
          activeDbIdentifiers.add(s.id);
        }
      }
    }

    // Combined unique active calls between memory and database
    const combined = new Set([...activeMemoryKeys, ...activeDbIdentifiers]);
    return combined.size;
  } catch (err) {
    console.warn('[concurrentTracker] Persistent DB active calls check failed, falling back to memory:', err);
    return activeMemoryKeys.size;
  }
}

export async function getCustomerConcurrentLimitInfo(userId: string) {
  const { data: userRecord } = await supabase.auth.admin.getUserById(userId);
  const userMeta = userRecord?.user?.user_metadata || {};
  const customLimit = typeof userMeta.custom_concurrent_calls_limit === 'number'
    ? userMeta.custom_concurrent_calls_limit
    : (userMeta.custom_concurrent_calls_limit ? parseInt(userMeta.custom_concurrent_calls_limit, 10) : null);

  const { data: customerAccount } = await supabase
    .from('customer_accounts')
    .select('plan_id, plans(id, name, max_concurrent_calls)')
    .eq('user_id', userId)
    .maybeSingle();

  const rawPlan = customerAccount?.plans;
  const plan = (Array.isArray(rawPlan) ? rawPlan[0] : rawPlan) as { id: string; name: string; max_concurrent_calls: number | null } | null | undefined;
  const planLimit = plan?.max_concurrent_calls ?? 1;
  const planName = plan?.name || 'Trial / Starter';

  const effectiveLimit = (customLimit !== null && !isNaN(customLimit) && customLimit > 0)
    ? customLimit
    : planLimit;

  const current = await getActiveCallsCount(userId);

  return {
    current,
    effectiveLimit,
    customLimit: (customLimit !== null && !isNaN(customLimit) && customLimit > 0) ? customLimit : null,
    planLimit,
    planName,
  };
}

