
-- ==================== 20261027120000_admin_auth.sql ====================
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

-- ==================== 20261027130000_access_requests.sql ====================
-- Free-access requests from the public form, reviewed by admins in the admin console.
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
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.admin_users(id),
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

-- ==================== 20261027140000_customer_accounts.sql ====================
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

-- ==================== 20261028120000_billing.sql ====================
-- Plans, coupons and paid checkout (Razorpay). Plans and coupons are edited in the admin console;
-- every table is API-only (RLS on, no policies, grants revoked from customer roles).
-- Money is stored in minor units: paise for INR, cents for USD.

CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name TEXT NOT NULL,
  tagline TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  -- Enterprise-style plans: shown with "Talk to sales" instead of a price and checkout.
  contact_sales BOOLEAN NOT NULL DEFAULT FALSE,
  monthly_minutes INTEGER CHECK (monthly_minutes IS NULL OR monthly_minutes >= 0),
  price_inr INTEGER NOT NULL DEFAULT 0 CHECK (price_inr >= 0),
  price_usd INTEGER NOT NULL DEFAULT 0 CHECK (price_usd >= 0),
  setup_fee_inr INTEGER NOT NULL DEFAULT 0 CHECK (setup_fee_inr >= 0),
  setup_fee_usd INTEGER NOT NULL DEFAULT 0 CHECK (setup_fee_usd >= 0),
  max_agents INTEGER CHECK (max_agents IS NULL OR max_agents >= 0),
  max_concurrent_calls INTEGER CHECK (max_concurrent_calls IS NULL OR max_concurrent_calls >= 0),
  -- Values for the admin-defined comparison rows: { "<plan_features.key>": "<display value>" }.
  feature_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS plans_slug_key ON public.plans (slug);

-- Extra rows of the pricing comparison table, editable by admins.
CREATE TABLE IF NOT EXISTS public.plan_features (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  percent_off NUMERIC(5, 2) CHECK (percent_off IS NULL OR (percent_off > 0 AND percent_off <= 100)),
  amount_off_inr INTEGER CHECK (amount_off_inr IS NULL OR amount_off_inr > 0),
  amount_off_usd INTEGER CHECK (amount_off_usd IS NULL OR amount_off_usd > 0),
  -- What the discount reduces: the whole first payment, only the plan price, or only the setup fee.
  applies_to TEXT NOT NULL DEFAULT 'total' CHECK (applies_to IN ('total', 'plan', 'setup')),
  -- Empty = every plan.
  plan_ids UUID[] NOT NULL DEFAULT '{}',
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (discount_type = 'percent' AND percent_off IS NOT NULL)
    OR (discount_type = 'fixed' AND (amount_off_inr IS NOT NULL OR amount_off_usd IS NOT NULL))
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_key ON public.coupons (code);

CREATE TABLE IF NOT EXISTS public.billing_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  -- Plan as it was when the price was quoted, so later plan edits never change a paid order.
  plan_snapshot JSONB NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('INR', 'USD')),
  plan_amount INTEGER NOT NULL CHECK (plan_amount >= 0),
  setup_fee INTEGER NOT NULL CHECK (setup_fee >= 0),
  discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total INTEGER NOT NULL CHECK (total > 0),
  coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
  coupon_code TEXT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL CHECK (email = lower(email)),
  phone TEXT NOT NULL,
  business_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'provisioned', 'failed', 'review')),
  failure_reason TEXT,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  paid_at TIMESTAMPTZ,
  provisioned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provisioned_at TIMESTAMPTZ,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_orders_razorpay_order_key ON public.billing_orders (razorpay_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS billing_orders_razorpay_payment_key ON public.billing_orders (razorpay_payment_id);
CREATE INDEX IF NOT EXISTS billing_orders_status_created_idx ON public.billing_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_orders_email_idx ON public.billing_orders (email);

-- The plan a customer login is on.
ALTER TABLE public.customer_accounts ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id);
ALTER TABLE public.customer_accounts ADD COLUMN IF NOT EXISTS plan_currency TEXT CHECK (plan_currency IN ('INR', 'USD'));
ALTER TABLE public.customer_accounts ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ;
ALTER TABLE public.customer_accounts ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE public.customer_accounts ADD COLUMN IF NOT EXISTS billing_order_id UUID REFERENCES public.billing_orders(id) ON DELETE SET NULL;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.plans FROM anon, authenticated;
REVOKE ALL ON TABLE public.plan_features FROM anon, authenticated;
REVOKE ALL ON TABLE public.coupons FROM anon, authenticated;
REVOKE ALL ON TABLE public.billing_orders FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.plans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plan_features TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.coupons TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.billing_orders TO service_role;

-- Counts one use of a coupon unless its limit is already reached. Returns whether it counted.
CREATE OR REPLACE FUNCTION public.redeem_coupon(p_coupon_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH counted AS (
    UPDATE public.coupons
    SET redemption_count = redemption_count + 1, updated_at = NOW()
    WHERE id = p_coupon_id
      AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM counted);
$$;

REVOKE ALL ON FUNCTION public.redeem_coupon(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_coupon(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.redeem_coupon(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(UUID) TO service_role;

-- Starting catalogue (from the AI Telecaller plan sheet); admins edit it from the console.
INSERT INTO public.plan_features (key, label, sort_order) VALUES
  ('calendar_booking', 'Calendar booking (INR)', 10),
  ('whatsapp_lead', 'WhatsApp lead', 20),
  ('telephony', 'Telephony', 30),
  ('topup_500_minutes', 'Top-up: 500 minutes (INR)', 40)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.plans (slug, name, tagline, sort_order, is_featured, contact_sales, monthly_minutes,
  price_inr, price_usd, setup_fee_inr, max_agents, max_concurrent_calls, feature_values) VALUES
  ('ai-starter', 'AI Starter', 'For a single location getting started with AI calls.', 10, FALSE, FALSE, 1000,
    799000, 10000, 900000, 3, 3,
    '{"calendar_booking": "2", "whatsapp_lead": "3", "telephony": "500", "topup_500_minutes": "4000"}'),
  ('ai-growth', 'AI Growth', 'For growing teams handling more conversations.', 20, TRUE, FALSE, 2500,
    1790000, 20000, 1400000, 4, 5,
    '{"calendar_booking": "2", "whatsapp_lead": "4", "telephony": "500", "topup_500_minutes": "3600"}'),
  ('ai-business-pro', 'AI Business Pro', 'For high-volume businesses and multiple teams.', 30, FALSE, FALSE, 5000,
    3000000, 35000, 1900000, 5, 5,
    '{"calendar_booking": "1", "telephony": "500", "topup_500_minutes": "3000"}'),
  ('enterprise', 'Enterprise', 'Custom volumes, integrations and support.', 40, FALSE, TRUE, NULL,
    0, 0, 0, NULL, NULL, '{}')
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ==================== 20261028130000_paid_signup.sql ====================
-- Paid signup: the customer chooses a password before paying, and every checkout attempt is kept
-- as a lead, including ones closed or failed in Razorpay, so the team can follow up.

-- bcrypt hash of the password chosen at checkout. The login is created from it only after the
-- payment is captured (Supabase accepts the hash directly), then it is cleared.
ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS password_hash TEXT;
-- When the person closed the confirmation or the Razorpay window without paying.
ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS checkout_dismissed_at TIMESTAMPTZ;
-- Last error Razorpay reported for a payment attempt (card declined and so on).
ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS payment_error TEXT;

NOTIFY pgrst, 'reload schema';

-- ==================== 20261028140000_admin_notifications.sql ====================
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

-- ==================== 20261028150000_checkout_reminders.sql ====================
-- Payment reminder for checkouts that were not paid: due 30 minutes after the checkout opens, or
-- 5 minutes after the payment window is closed or a payment fails. The API sends at most one per
-- order and includes a link that reopens the saved order (only a hash of its token is stored).

ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS reminder_due_at TIMESTAMPTZ;
ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS resume_token_hash TEXT;

CREATE INDEX IF NOT EXISTS billing_orders_reminder_due_idx
  ON public.billing_orders (reminder_due_at)
  WHERE status = 'created' AND reminder_sent_at IS NULL;

NOTIFY pgrst, 'reload schema';

