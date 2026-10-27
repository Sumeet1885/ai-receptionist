import { supabase } from '../../services/db';

// The only place that queries customer_accounts (service role; no customer policies).

export interface CustomerAccount {
  user_id: string;
  access_request_id: string | null;
  status: 'active' | 'suspended';
  password_set_at: string | null;
  onboarding_completed_at: string | null;
}

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export async function getCustomerAccount(userId: string) {
  return check(
    await supabase
      .from('customer_accounts')
      .select('user_id,access_request_id,status,password_set_at,onboarding_completed_at')
      .eq('user_id', userId)
      .maybeSingle<CustomerAccount>(),
    'get customer account',
  );
}

// accessRequestId is null for paid signups (they come from a billing order, not a request).
export async function createCustomerAccount(userId: string, accessRequestId: string | null) {
  check(
    await supabase
      .from('customer_accounts')
      .upsert({ user_id: userId, access_request_id: accessRequestId }, { onConflict: 'user_id', ignoreDuplicates: true }),
    'create customer account',
  );
}

export async function markCustomerAccount(userId: string, changes: Partial<Pick<CustomerAccount, 'password_set_at' | 'onboarding_completed_at'>>) {
  check(
    await supabase
      .from('customer_accounts')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('user_id', userId),
    'update customer account',
  );
}
