-- Who receives the admin alert emails, managed by super admins in the admin console (replaces the
-- ADMIN_NOTIFICATION_EMAILS setting). While the table is empty, alerts go to every active
-- super_admin. API-only: RLS on, no policies, grants revoked from customer roles.

CREATE TABLE IF NOT EXISTS public.admin_notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL CHECK (email = lower(email) AND char_length(email) <= 254),
  label TEXT CHECK (label IS NULL OR char_length(label) <= 80),
  notify_access_requests BOOLEAN NOT NULL DEFAULT TRUE,
  notify_payments BOOLEAN NOT NULL DEFAULT TRUE,
  notify_signup_leads BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_notification_recipients_email_key ON public.admin_notification_recipients (email);

ALTER TABLE public.admin_notification_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_notification_recipients FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_notification_recipients TO service_role;

-- A lead alert is sent once per checkout, the first time it is closed or fails.
ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS lead_notified_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
