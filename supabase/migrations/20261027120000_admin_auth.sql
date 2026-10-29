-- Admin (super-admin console) identity, sessions and audit. Separate from customer Supabase Auth:
-- no link to auth.users, and only the API's service role can read or write these tables.
-- Design: docs/modernization/03-admin-auth.md

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL CHECK (email = lower(email)),
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_key ON public.admin_users (email);

CREATE TABLE IF NOT EXISTS public.admin_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.admin_users(id),
  role TEXT NOT NULL CHECK (role IN ('read_only', 'support', 'super_admin')),
  -- NULL only for the bootstrap seed of the first super_admin.
  granted_by UUID REFERENCES public.admin_users(id),
  reason TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  CHECK (granted_by IS DISTINCT FROM admin_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_role_assignments_active_key
  ON public.admin_role_assignments (admin_user_id, role) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.admin_users(id),
  -- SHA-256 (hex) of the cookie value; the raw token is never stored.
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS admin_sessions_admin_user_id_idx ON public.admin_sessions (admin_user_id);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_admin_user_id UUID REFERENCES public.admin_users(id),
  actor_session_id UUID REFERENCES public.admin_sessions(id),
  action TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allowed', 'denied')),
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'pending')),
  tenant_owner_id UUID,
  resource_type TEXT,
  resource_id TEXT,
  reason TEXT,
  ip TEXT,
  -- Allow-listed fields only: never passwords, tokens or transcripts.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx
  ON public.admin_audit_log (actor_admin_user_id, occurred_at DESC);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_users FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_role_assignments FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_audit_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.admin_audit_log_id_seq FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_users TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_role_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_sessions TO service_role;
-- Audit is insert-only for the API.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.admin_audit_log FROM service_role;
GRANT SELECT, INSERT ON TABLE public.admin_audit_log TO service_role;
GRANT USAGE ON SEQUENCE public.admin_audit_log_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.admin_audit_log_reject_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_log_append_only ON public.admin_audit_log;
CREATE TRIGGER admin_audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_log_reject_change();

-- Atomic failed-login bookkeeping: 5 consecutive failures lock the account for 15 minutes.
CREATE OR REPLACE FUNCTION public.admin_record_login_failure(p_admin_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.admin_users
  SET failed_attempts = failed_attempts + 1,
      locked_until = CASE
        WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
        ELSE locked_until
      END
  WHERE id = p_admin_user_id;
$$;

REVOKE ALL ON FUNCTION public.admin_record_login_failure(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_record_login_failure(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.admin_record_login_failure(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_login_failure(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
