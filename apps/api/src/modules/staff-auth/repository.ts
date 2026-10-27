import { supabase } from '../../services/db';
import { logger } from '../../services/cloudwatchLogger';
import type { StaffRole } from './session';

// The only place that queries staff_* tables. The service role bypasses RLS; these tables
// have no customer-facing policies at all.

export interface StaffPrincipal {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  status: 'active' | 'suspended' | 'revoked';
  failed_attempts: number;
  locked_until: string | null;
  must_change_password: boolean;
}

export interface StaffSession {
  id: string;
  principal_id: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export interface StaffAuditEvent {
  action: string;
  decision: 'allowed' | 'denied';
  outcome: 'succeeded' | 'failed' | 'pending';
  actor_principal_id?: string | null;
  actor_session_id?: string | null;
  tenant_owner_id?: string | null;
  resource_type?: string;
  resource_id?: string;
  reason?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

const PRINCIPAL_COLUMNS = 'id,email,display_name,password_hash,status,failed_attempts,locked_until,must_change_password';

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export async function findPrincipalByEmail(email: string) {
  return check(
    await supabase.from('staff_principals').select(PRINCIPAL_COLUMNS).eq('email', email).maybeSingle<StaffPrincipal>(),
    'find staff principal',
  );
}

export async function findPrincipalById(id: string) {
  return check(
    await supabase.from('staff_principals').select(PRINCIPAL_COLUMNS).eq('id', id).maybeSingle<StaffPrincipal>(),
    'find staff principal',
  );
}

export async function createPrincipal(input: { email: string; displayName: string; passwordHash: string }) {
  return check(
    await supabase
      .from('staff_principals')
      .insert({ email: input.email, display_name: input.displayName, password_hash: input.passwordHash })
      .select(PRINCIPAL_COLUMNS)
      .single<StaffPrincipal>(),
    'create staff principal',
  );
}

export async function getActiveRoles(principalId: string): Promise<StaffRole[]> {
  const rows = check(
    await supabase.from('staff_role_assignments').select('role').eq('principal_id', principalId).is('revoked_at', null),
    'load staff roles',
  );
  return (rows ?? []).map((row: { role: StaffRole }) => row.role);
}

export async function grantRole(input: { principalId: string; role: StaffRole; grantedBy: string | null; reason: string }) {
  check(
    await supabase.from('staff_role_assignments').insert({
      principal_id: input.principalId,
      role: input.role,
      granted_by: input.grantedBy,
      reason: input.reason,
    }),
    'grant staff role',
  );
}

export async function recordLoginFailure(principalId: string) {
  check(await supabase.rpc('staff_record_login_failure', { p_principal_id: principalId }), 'record login failure');
}

export async function recordLoginSuccess(principalId: string) {
  check(
    await supabase
      .from('staff_principals')
      .update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() })
      .eq('id', principalId),
    'record login success',
  );
}

export async function setPassword(principalId: string, passwordHash: string, mustChange: boolean) {
  check(
    await supabase
      .from('staff_principals')
      .update({
        password_hash: passwordHash,
        must_change_password: mustChange,
        password_changed_at: new Date().toISOString(),
        failed_attempts: 0,
        locked_until: null,
      })
      .eq('id', principalId),
    'set staff password',
  );
}

export async function createSession(input: { principalId: string; tokenHash: string; expiresAt: Date; ip: string; userAgent?: string }) {
  return check(
    await supabase
      .from('staff_sessions')
      .insert({
        principal_id: input.principalId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt.toISOString(),
        ip: input.ip,
        user_agent: input.userAgent?.slice(0, 500) ?? null,
      })
      .select('id')
      .single<{ id: string }>(),
    'create staff session',
  );
}

export async function findSessionByTokenHash(tokenHash: string) {
  return check(
    await supabase
      .from('staff_sessions')
      .select('id,principal_id,expires_at,last_seen_at,revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle<StaffSession>(),
    'find staff session',
  );
}

export async function touchSession(sessionId: string) {
  check(
    await supabase.from('staff_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', sessionId),
    'touch staff session',
  );
}

export async function revokeSession(sessionId: string) {
  check(
    await supabase.from('staff_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionId).is('revoked_at', null),
    'revoke staff session',
  );
}

export async function revokeOtherSessions(principalId: string, keepSessionId: string | null) {
  let query = supabase
    .from('staff_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('principal_id', principalId)
    .is('revoked_at', null);
  if (keepSessionId) query = query.neq('id', keepSessionId);
  check(await query, 'revoke staff sessions');
}

// Audit failures are logged, never thrown: a broken audit insert must not take login down.
export async function recordAudit(event: StaffAuditEvent) {
  const { error } = await supabase.from('staff_audit_events').insert({ ...event, metadata: event.metadata ?? {} });
  if (error) logger.error('[StaffAuth] audit insert failed', { action: event.action, error: error.message });
}
