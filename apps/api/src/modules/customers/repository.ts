import { supabase } from '../../services/db';
import { type AccountStage } from '../accounts/stage';

// Customer rows, filters and counts are assembled and paginated in PostgreSQL.

export interface CustomerRow {
  userId: string;
  email: string;
  name: string | null;
  businessName: string | null;
  status: 'active' | 'suspended';
  stage: AccountStage;
  source: 'paid' | 'access_request' | 'existing';
  plan: { name: string; currency: string | null; periodEnd: string | null; startsAt?: string | null } | null;
  agents: number;
  createdAt: string;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
}

export interface CustomerPage {
  rows: CustomerRow[];
  total: number;
  counts: Record<string, number>;
}
export async function listCustomers(filters: {
  page: number;
  pageSize: number;
  stage?: string;
  search?: string;
  userId?: string;
}): Promise<CustomerPage> {
  const { data, error } = await supabase.rpc('admin_customer_page', {
    p_page: filters.page,
    p_size: filters.pageSize,
    p_stage: filters.stage || null,
    p_search: filters.search || '',
    p_user: filters.userId || null,
  });
  if (error) throw Object.assign(new Error(`list customers: ${error.message}`), { code: error.code });
  return data as CustomerPage;
}
export async function getCustomer(userId: string) {
  const result = await listCustomers({ page: 1, pageSize: 1, userId });
  return result.rows[0] || null;
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
  const { error: banError } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: status === 'suspended' ? '876000h' : 'none',
  });
  if (banError) throw new Error(`update login ban: ${banError.message}`);
  return true;
}
