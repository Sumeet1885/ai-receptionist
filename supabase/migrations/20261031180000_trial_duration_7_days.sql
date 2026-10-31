-- Update default trial period from 14 days to 7 days
UPDATE public.plans
SET trial_days = 7, updated_at = now()
WHERE slug = 'trial-period' AND (trial_days = 14 OR trial_days IS NULL);

