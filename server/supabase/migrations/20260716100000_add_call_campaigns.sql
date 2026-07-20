-- ── 15. Bulk Call Campaigns ─────────────────────────────────────────
-- Run this in your Supabase Dashboard SQL Editor.

-- Campaign batches
CREATE TABLE IF NOT EXISTS public.call_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id           UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  owner_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL DEFAULT 'Campaign',
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
  total_contacts   INTEGER NOT NULL DEFAULT 0,
  called_count     INTEGER NOT NULL DEFAULT 0,
  -- Per-campaign hourly cap override. NULL = use the bot-level dograh_outbound_hourly_cap.
  -- This allows campaigns to run at a higher throughput than single-dial mode.
  hourly_cap_override INTEGER CHECK (hourly_cap_override BETWEEN 1 AND 500),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

ALTER TABLE public.call_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_campaigns" ON public.call_campaigns;
CREATE POLICY "owner_campaigns" ON public.call_campaigns
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS call_campaigns_bot_id_idx ON public.call_campaigns (bot_id, created_at DESC);

-- One row per contact in a campaign
CREATE TABLE IF NOT EXISTS public.campaign_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES public.call_campaigns(id) ON DELETE CASCADE,
  bot_id          UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  phone_number    TEXT NOT NULL,
  name            TEXT,
  extra_data      JSONB,             -- all other Excel columns verbatim
  call_status     TEXT NOT NULL DEFAULT 'pending'
                    CHECK (call_status IN ('pending', 'calling', 'done', 'failed', 'skipped')),
  phone_call_id   UUID REFERENCES public.phone_calls(id) ON DELETE SET NULL,
  session_id      UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  call_summary    TEXT,              -- back-filled from leads.summary after poller syncs
  lead_score      TEXT,              -- back-filled from leads.lead_score
  call_duration   INTEGER,           -- back-filled from phone_calls.duration_seconds
  error_message   TEXT,
  called_at       TIMESTAMPTZ,
  row_index       INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_campaign_contacts" ON public.campaign_contacts;
CREATE POLICY "owner_campaign_contacts" ON public.campaign_contacts
  FOR ALL
  USING (
    campaign_id IN (SELECT id FROM public.call_campaigns WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    campaign_id IN (SELECT id FROM public.call_campaigns WHERE owner_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS campaign_contacts_campaign_id_idx
  ON public.campaign_contacts (campaign_id, row_index);

CREATE INDEX IF NOT EXISTS campaign_contacts_phone_call_id_idx
  ON public.campaign_contacts (phone_call_id)
  WHERE phone_call_id IS NOT NULL;

-- Reload Schema Cache
NOTIFY pgrst, 'reload schema';

-- Helper RPC used by the campaign runner to safely increment called_count
CREATE OR REPLACE FUNCTION public.increment_campaign_called_count(campaign_id_arg UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  UPDATE public.call_campaigns
  SET called_count = (
    SELECT COUNT(*) FROM public.campaign_contacts
    WHERE campaign_id = campaign_id_arg
      AND call_status IN ('calling', 'done', 'failed')
  )
  WHERE id = campaign_id_arg;
$$;
