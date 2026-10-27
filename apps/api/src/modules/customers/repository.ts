import { supabase } from '../../services/db';
import { computeAccountStage, type AccountStage } from '../accounts/stage';

// Customer workspaces for the admin console: customer_accounts joined with the Supabase login,
// the plan and the number of agents. Assembled in memory, which is fine while customers number
// in the thousands; move to a SQL view before that.

const MAX_ACCOUNTS = 5000;

export interface CustomerRow {
  userId: string;
  email: string;
  name: string | null;
  businessName: string | null;
  status: 'active' | 'suspended';
  stage: AccountStage;
  source: 'paid' | 'access_request' | 'existing';
  plan: { name: string; currency: string | null; periodEnd: string | null } | null;
  agents: number;
  createdAt: string;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
}

interface AccountRecord {
  user_id: string;
  status: 'active' | 'suspended';
  access_request_id: string | null;
  billing_order_id: string | null;
  password_set_at: string | null;
  onboarding_completed_at: string | null;
  plan_currency: string | null;
  current_period_end: string | null;
  created_at: string;
  plans: { name: string } | null;
}

async function listAuthUsers() {
  const users = new Map<string, { email: string; meta: Record<string, any>; confirmed: string | null; lastSignIn: string | null }>();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`list users: ${error.message}`);
    for (const user of data.users) {
      users.set(user.id, { email: user.email ?? '', meta: user.user_metadata ?? {}, confirmed: user.email_confirmed_at ?? null, lastSignIn: user.last_sign_in_at ?? null });
    }
    if (data.users.length < 1000) break;
  }
  return users;
}

async function agentCounts() {
  const { data, error } = await supabase.from('bots').select('owner_id').limit(50_000);
  if (error) throw new Error(`count agents: ${error.message}`);
  const counts = new Map<string, number>();
  for (const { owner_id } of data ?? []) counts.set(owner_id, (counts.get(owner_id) ?? 0) + 1);
  return counts;
}

export async function listCustomers(): Promise<CustomerRow[]> {
  const [accountsResult, users, agents] = await Promise.all([
    supabase
      .from('customer_accounts')
      .select('user_id,status,access_request_id,billing_order_id,password_set_at,onboarding_completed_at,plan_currency,current_period_end,created_at,plans(name)')
      .order('created_at', { ascending: false })
      .limit(MAX_ACCOUNTS),
    listAuthUsers(),
    agentCounts(),
  ]);
  if (accountsResult.error) throw Object.assign(new Error(`list customers: ${accountsResult.error.message}`), { code: accountsResult.error.code });

  return ((accountsResult.data ?? []) as unknown as AccountRecord[]).map((account) => {
    const user = users.get(account.user_id);
    return {
      userId: account.user_id,
      email: user?.email ?? '',
      name: user?.meta.full_name ?? user?.meta.name ?? null,
      businessName: user?.meta.business_name ?? null,
      status: account.status,
      stage: computeAccountStage(account, Boolean(user?.confirmed)),
      source: account.billing_order_id ? 'paid' : account.access_request_id ? 'access_request' : 'existing',
      plan: account.plans ? { name: account.plans.name, currency: account.plan_currency, periodEnd: account.current_period_end } : null,
      agents: agents.get(account.user_id) ?? 0,
      createdAt: account.created_at,
      emailConfirmedAt: user?.confirmed ?? null,
      lastSignInAt: user?.lastSignIn ?? null,
    };
  });
}

export async function setCustomerStatus(userId: string, status: 'active' | 'suspended') {
  const { data, error } = await supabase
    .from('customer_accounts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle();
  if (error) throw new Error(`set customer status: ${error.message}`);
  if (!data) return false;
  // A ban also stops sign-in and token refresh at Supabase, so suspension takes effect at once.
  const { error: banError } = await supabase.auth.admin.updateUserById(userId, { ban_duration: status === 'suspended' ? '876000h' : 'none' });
  if (banError) throw new Error(`update login ban: ${banError.message}`);
  return true;
}
