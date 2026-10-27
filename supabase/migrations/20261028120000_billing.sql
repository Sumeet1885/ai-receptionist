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
