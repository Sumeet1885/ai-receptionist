-- Drop existing check constraints on call_status in campaign_contacts table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT constraint_name
        FROM information_schema.constraint_column_usage
        WHERE table_name = 'campaign_contacts' AND column_name = 'call_status'
    LOOP
        EXECUTE 'ALTER TABLE public.campaign_contacts DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- Add updated check constraint to allow 'not_pickup'
ALTER TABLE public.campaign_contacts
  ADD CONSTRAINT campaign_contacts_call_status_check
  CHECK (call_status IN ('pending', 'calling', 'done', 'failed', 'skipped', 'not_pickup'));

-- Update the increment_campaign_called_count function to include 'not_pickup'
CREATE OR REPLACE FUNCTION public.increment_campaign_called_count(campaign_id_arg UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  UPDATE public.call_campaigns
  SET called_count = (
    SELECT COUNT(*) FROM public.campaign_contacts
    WHERE campaign_id = campaign_id_arg
      AND call_status IN ('calling', 'done', 'failed', 'not_pickup')
  )
  WHERE id = campaign_id_arg;
$$;

-- Notify postgrest to reload the schema cache
NOTIFY pgrst, 'reload schema';
