-- Editable catalogue defaults, in major currency units (USD, not cents).
-- Preserve prices and pack sizes already configured by an administrator.
INSERT INTO public.plan_features (key, label, sort_order)
VALUES ('topup_500_minutes_usd', 'Top-up: 500 minutes (USD)', 41)
ON CONFLICT (key) DO NOTHING;

UPDATE public.plans AS p
SET feature_values = COALESCE(p.feature_values, '{}'::jsonb)
  || CASE WHEN NULLIF(BTRIM(p.feature_values->>'topup_500_minutes_usd'), '') IS NULL
       THEN jsonb_build_object('topup_500_minutes_usd', defaults.usd_price)
       ELSE '{}'::jsonb END
  || CASE WHEN NULLIF(BTRIM(p.feature_values->>'topup_minutes'), '') IS NULL
       THEN jsonb_build_object('topup_minutes', '500')
       ELSE '{}'::jsonb END
FROM (VALUES
  ('ai-starter', '50'),
  ('ai-growth', '45'),
  ('ai-business-pro', '40')
) AS defaults(slug, usd_price)
WHERE p.slug = defaults.slug
  AND NOT p.is_trial
  AND NOT p.contact_sales;

NOTIFY pgrst, 'reload schema';
