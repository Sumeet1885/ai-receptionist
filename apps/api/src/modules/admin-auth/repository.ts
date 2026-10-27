import { supabase } from '../../services/db';
import { logger } from '../../services/cloudwatchLogger';
import type { AdminRole } from './session';

// The only place that queries admin_* tables. The service role bypasses RLS; these tables
// have no customer-facing policies at all.

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  status: 'active' | 'suspended' | 'revoked';
  failed_attempts: number;
  locked_until: string | null;
  must_change_password: boolean;
}

export interface AdminSession {
  id: string;
  admin_user_id: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export interface AdminAuditEvent {
  action: string;
  decision: 'allowed' | 'denied';
  outcome: 'succeeded' | 'failed' | 'pending';
  actor_admin_user_id?: string | null;
  actor_session_id?: string | null;
  tenant_owner_id?: string | null;
  resource_type?: string;
  resource_id?: string;
  reason?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

const ADMIN_USER_COLUMNS = 'id,email,display_name,password_hash,status,failed_attempts,locked_until,must_change_password';

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export async function findAdminUserByEmail(email: string) {
  return check(
    await supabase.from('admin_users').select(ADMIN_USER_COLUMNS).eq('email', email).maybeSingle<AdminUser>(),
    'find admin adminUser',
  );
}

export async function findAdminUserById(id: string) {
  return check(
    await supabase.from('admin_users').select(ADMIN_USER_COLUMNS).eq('id', id).maybeSingle<AdminUser>(),
    'find admin adminUser',
  );
}

export async function createAdminUser(input: { email: string; displayName: string; passwordHash: string }) {
  return check(
    await supabase
      .from('admin_users')
      .insert({ email: input.email, display_name: input.displayName, password_hash: input.passwordHash })
      .select(ADMIN_USER_COLUMNS)
      .single<AdminUser>(),
    'create admin adminUser',
  );
}

export async function getActiveRoles(adminUserId: string): Promise<AdminRole[]> {
  const rows = check(
    await supabase.from('admin_role_assignments').select('role').eq('admin_user_id', adminUserId).is('revoked_at', null),
    'load admin roles',
  );
  return (rows ?? []).map((row: { role: AdminRole }) => row.role);
}

export async function grantRole(input: { adminUserId: string; role: AdminRole; grantedBy: string | null; reason: string }) {
  check(
    await supabase.from('admin_role_assignments').insert({
      admin_user_id: input.adminUserId,
      role: input.role,
      granted_by: input.grantedBy,
      reason: input.reason,
    }),
    'grant admin role',
  );
}

export async function recordLoginFailure(adminUserId: string) {
  check(await supabase.rpc('admin_record_login_failure', { p_admin_user_id: adminUserId }), 'record login failure');
}

export async function recordLoginSuccess(adminUserId: string) {
  check(
    await supabase
      .from('admin_users')
      .update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() })
      .eq('id', adminUserId),
    'record login success',
  );
}

export async function setPassword(adminUserId: string, passwordHash: string, mustChange: boolean) {
  check(
    await supabase
      .from('admin_users')
      .update({
        password_hash: passwordHash,
        must_change_password: mustChange,
        password_changed_at: new Date().toISOString(),
        failed_attempts: 0,
        locked_until: null,
      })
      .eq('id', adminUserId),
    'set admin password',
  );
}

export async function createSession(input: { adminUserId: string; tokenHash: string; expiresAt: Date; ip: string; userAgent?: string }) {
  return check(
    await supabase
      .from('admin_sessions')
      .insert({
        admin_user_id: input.adminUserId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt.toISOString(),
        ip: input.ip,
        user_agent: input.userAgent?.slice(0, 500) ?? null,
      })
      .select('id')
      .single<{ id: string }>(),
    'create admin session',
  );
}

export async function findSessionByTokenHash(tokenHash: string) {
  return check(
    await supabase
      .from('admin_sessions')
      .select('id,admin_user_id,expires_at,last_seen_at,revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle<AdminSession>(),
    'find admin session',
  );
}

export async function touchSession(sessionId: string) {
  check(
    await supabase.from('admin_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', sessionId),
    'touch admin session',
  );
}

export async function revokeSession(sessionId: string) {
  check(
    await supabase.from('admin_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionId).is('revoked_at', null),
    'revoke admin session',
  );
}

export async function revokeOtherSessions(adminUserId: string, keepSessionId: string | null) {
  let query = supabase
    .from('admin_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('admin_user_id', adminUserId)
    .is('revoked_at', null);
  if (keepSessionId) query = query.neq('id', keepSessionId);
  check(await query, 'revoke admin sessions');
}

export async function listActiveSuperAdminEmails(): Promise<string[]> {
  const rows = check(
    await supabase
      .from('admin_role_assignments')
      .select('admin_users!admin_role_assignments_admin_user_id_fkey(email,status)')
      .eq('role', 'super_admin')
      .is('revoked_at', null),
    'list super admins',
  ) as unknown as Array<{ admin_users: { email: string; status: string } | null }>;
  return [...new Set(rows
    .map((row) => row.admin_users)
    .filter((adminUser): adminUser is { email: string; status: string } => adminUser?.status === 'active')
    .map((adminUser) => adminUser.email))];
}

// Audit failures are logged, never thrown: a broken audit insert must not take login down.
export async function recordAudit(event: AdminAuditEvent) {
  const { error } = await supabase.from('admin_audit_log').insert({ ...event, metadata: event.metadata ?? {} });
  if (error) logger.error('[AdminAuth] audit insert failed', { action: event.action, error: error.message });
}
