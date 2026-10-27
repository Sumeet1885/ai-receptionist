import type { AccessRequestValues } from '@ai-receptionist/contracts';
import { supabase } from '../../services/db';

// The only place that queries access_requests (service role; the table has no customer policies).

export type AccessRequestStatus = 'pending' | 'contacted' | 'approved' | 'rejected';
export const OPEN_STATUSES: AccessRequestStatus[] = ['pending', 'contacted'];

export interface AccessRequestRow {
  id: string;
  status: AccessRequestStatus;
  full_name: string;
  email: string;
  phone: string;
  business_name: string;
  industry: string;
  website: string | null;
  city: string | null;
  monthly_volume: string | null;
  languages: string[];
  use_case: string | null;
  ip: string | null;
  user_agent: string | null;
  staff_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  provisioned_user_id: string | null;
  provisioned_at: string | null;
  activation_sent_at: string | null;
  activation_send_count: number;
  created_at: string;
  updated_at: string;
}

function check<T>(result: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (result.error) throw Object.assign(new Error(`${what}: ${result.error.message}`), { code: result.error.code });
  return result.data;
}

export async function authEmailExists(email: string): Promise<boolean> {
  return Boolean(check(await supabase.rpc('auth_email_exists', { p_email: email }), 'check auth email'));
}

export async function findOpenRequestByEmail(email: string) {
  return check(
    await supabase
      .from('access_requests')
      .select('id,status')
      .eq('email', email)
      .in('status', OPEN_STATUSES)
      .maybeSingle<{ id: string; status: AccessRequestStatus }>(),
    'find open access request',
  );
}

// Returns null when an open request for this email already exists (unique index), so concurrent
// duplicate submits resolve to one row.
export async function insertAccessRequest(value: AccessRequestValues, meta: { ip: string; userAgent?: string }) {
  const result = await supabase
    .from('access_requests')
    .insert({
      full_name: value.fullName,
      email: value.email,
      phone: value.phone,
      business_name: value.businessName,
      industry: value.industry,
      website: value.website,
      city: value.city,
      monthly_volume: value.monthlyVolume,
      languages: value.languages,
      use_case: value.useCase,
      ip: meta.ip,
      user_agent: meta.userAgent?.slice(0, 500) ?? null,
    })
    .select('id')
    .single<{ id: string }>();
  if (result.error?.code === '23505') return null;
  return check(result, 'insert access request');
}

export interface ListFilters {
  status?: AccessRequestStatus;
  search?: string;
  page: number;
  pageSize: number;
}

export async function listAccessRequests(filters: ListFilters) {
  let query = supabase
    .from('access_requests')
    .select('id,status,full_name,email,phone,business_name,industry,city,created_at,reviewed_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize - 1);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.search) {
    // Only letters, digits and a few separators reach the PostgREST filter string.
    const term = filters.search.replace(/[^\p{L}\p{N}@.+\- ]/gu, '').slice(0, 80);
    if (term) query = query.or(`email.ilike.*${term}*,business_name.ilike.*${term}*,full_name.ilike.*${term}*,phone.ilike.*${term}*`);
  }
  const { data, error, count } = await query;
  if (error) throw new Error(`list access requests: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function countByStatus() {
  const counts: Record<AccessRequestStatus, number> = { pending: 0, contacted: 0, approved: 0, rejected: 0 };
  await Promise.all((Object.keys(counts) as AccessRequestStatus[]).map(async (status) => {
    const { count, error } = await supabase.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', status);
    if (error) throw new Error(`count access requests: ${error.message}`);
    counts[status] = count ?? 0;
  }));
  return counts;
}

export async function getAccessRequest(id: string) {
  return check(
    await supabase.from('access_requests').select('*').eq('id', id).maybeSingle<AccessRequestRow>(),
    'get access request',
  );
}

export async function findLatestProvisionedRequestByEmail(email: string) {
  return check(
    await supabase
      .from('access_requests')
      .select('*')
      .eq('email', email)
      .eq('status', 'approved')
      .not('provisioned_user_id', 'is', null)
      .order('provisioned_at', { ascending: false })
      .limit(1)
      .maybeSingle<AccessRequestRow>(),
    'find provisioned access request',
  );
}

export async function findLatestRequestForUser(userId: string) {
  return check(
    await supabase
      .from('access_requests')
      .select('*')
      .eq('provisioned_user_id', userId)
      .order('provisioned_at', { ascending: false })
      .limit(1)
      .maybeSingle<AccessRequestRow>(),
    'find access request for user',
  );
}

// Compare-and-set: updates only while the row is still in one of `fromStatuses`, so two staff
// members acting at once cannot both approve or reject. Returns null when the state moved on.
export async function transitionAccessRequest(
  id: string,
  fromStatuses: AccessRequestStatus[],
  changes: Partial<AccessRequestRow>,
) {
  return check(
    await supabase
      .from('access_requests')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', fromStatuses)
      .select('*')
      .maybeSingle<AccessRequestRow>(),
    'update access request',
  );
}

export async function updateAccessRequest(id: string, changes: Partial<AccessRequestRow>) {
  return check(
    await supabase
      .from('access_requests')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single<AccessRequestRow>(),
    'update access request',
  );
}
