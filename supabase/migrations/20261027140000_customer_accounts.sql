-- Where each customer login is in its lifecycle, so the app can resume them at the right step:
-- activation (verify email + set password) → onboarding → active. Written only by the API.
-- Plan: docs/modernization/04-access-requests-and-billing-plan.md

CREATE TABLE IF NOT EXISTS public.customer_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_request_id UUID REFERENCES public.access_requests(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  password_set_at TIMESTAMPTZ,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_accounts TO service_role;

-- Every login that exists before gated access keeps working exactly as today: treat it as
-- activated and onboarded. Users who only ever signed in with Google/Microsoft have no password;
-- they set one through "Forgot password".
INSERT INTO public.customer_accounts (user_id, password_set_at, onboarding_completed_at)
SELECT id, created_at, NOW()
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
