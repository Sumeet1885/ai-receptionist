import { supabase } from '../../services/db';

interface ActiveCall {
  key: string;
  ownerId: string;
  botId: string;
  direction: 'inbound' | 'outbound';
  startedAt: number;
}

// In-memory registry with a 15-minute fallback timeout (max call duration is 10-15 mins)
const activeCalls = new Map<string, ActiveCall>();
const MAX_CALL_TIMEOUT_MS = 15 * 60 * 1000;

export function trackCallStart(params: {
  key: string;
  ownerId: string;
  botId: string;
  direction: 'inbound' | 'outbound';
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
  });
}

export function trackCallEnd(key: string): void {
  activeCalls.delete(key);
}

export function getActiveCallsCount(ownerId: string): number {
  const now = Date.now();
  let count = 0;
  for (const [k, call] of activeCalls.entries()) {
    if (now - call.startedAt > MAX_CALL_TIMEOUT_MS) {
      activeCalls.delete(k);
    } else if (call.ownerId === ownerId) {
      count++;
    }
  }
  return count;
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

  const current = getActiveCallsCount(userId);

  return {
    current,
    effectiveLimit,
    customLimit: (customLimit !== null && !isNaN(customLimit) && customLimit > 0) ? customLimit : null,
    planLimit,
    planName,
  };
}

