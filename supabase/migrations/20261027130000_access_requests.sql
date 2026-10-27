-- Free-access requests from the public form, reviewed by staff in the admin console.
-- API-only (service role): RLS on with no policies, grants revoked from customer roles.
-- Plan: docs/modernization/04-access-requests-and-billing-plan.md

CREATE TABLE IF NOT EXISTS public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'contacted', 'approved', 'rejected')),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL CHECK (email = lower(email)),
  phone TEXT NOT NULL,
  business_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  website TEXT,
  city TEXT,
  monthly_volume TEXT,
  languages TEXT[] NOT NULL DEFAULT '{}',
  use_case TEXT,
  ip TEXT,
  user_agent TEXT,
  staff_notes TEXT,
  reviewed_by UUID REFERENCES public.staff_principals(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  provisioned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provisioned_at TIMESTAMPTZ,
  activation_sent_at TIMESTAMPTZ,
  activation_send_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one open request per email address.
CREATE UNIQUE INDEX IF NOT EXISTS access_requests_open_email_key
  ON public.access_requests (email) WHERE status IN ('pending', 'contacted');
CREATE INDEX IF NOT EXISTS access_requests_status_created_idx
  ON public.access_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS access_requests_email_idx ON public.access_requests (email);

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.access_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.access_requests TO service_role;

-- Lets the API check whether an email already has a customer login without listing users.
CREATE OR REPLACE FUNCTION public.auth_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email));
$$;

REVOKE ALL ON FUNCTION public.auth_email_exists(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_email_exists(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.auth_email_exists(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_exists(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
