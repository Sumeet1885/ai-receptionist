CREATE TABLE IF NOT EXISTS public.calendar_oauth_states (
  state_hash TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.calendar_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS calendar_oauth_states_owner_id_idx
  ON public.calendar_oauth_states (owner_id);

REVOKE ALL ON TABLE public.calendar_oauth_states FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.calendar_oauth_states TO service_role;

CREATE OR REPLACE FUNCTION public.consume_calendar_oauth_state(
  p_state_hash TEXT,
  p_provider TEXT
)
RETURNS TABLE(owner_id UUID)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  DELETE FROM public.calendar_oauth_states
  WHERE state_hash = p_state_hash
    AND provider = p_provider
    AND expires_at > NOW()
  RETURNING calendar_oauth_states.owner_id;
$$;

REVOKE ALL ON FUNCTION public.consume_calendar_oauth_state(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_calendar_oauth_state(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.consume_calendar_oauth_state(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_calendar_oauth_state(TEXT, TEXT) TO service_role;

-- The current product exposes one active calendar connection per owner. Keep the
-- newest row if historical migrations allowed both providers simultaneously.
WITH ranked_connections AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY owner_id
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS row_number
  FROM public.calendar_connections
)
DELETE FROM public.calendar_connections connection
USING ranked_connections ranked
WHERE connection.id = ranked.id
  AND ranked.row_number > 1;

ALTER TABLE public.calendar_connections
  DROP CONSTRAINT IF EXISTS unique_owner_calendar;

ALTER TABLE public.calendar_connections
  ADD CONSTRAINT unique_owner_calendar UNIQUE (owner_id);

NOTIFY pgrst, 'reload schema';
