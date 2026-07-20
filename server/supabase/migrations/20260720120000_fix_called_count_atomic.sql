-- Migration: fix increment_campaign_called_count to be truly atomic
--
-- The previous implementation used a subquery-recount inside the UPDATE:
--   SET called_count = (SELECT COUNT(*) FROM campaign_contacts WHERE ...)
-- This is still vulnerable to a race window — two concurrent calls can both
-- read the same count before either write lands, losing one increment.
--
-- The fix: use called_count + 1 so Postgres increments the row's current
-- value in a single atomic statement, with no round-trip read required.

CREATE OR REPLACE FUNCTION public.increment_campaign_called_count(campaign_id_arg UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  UPDATE public.call_campaigns
  SET called_count = called_count + 1
  WHERE id = campaign_id_arg;
$$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
