-- ============================================================
-- AI Receptionist — Dograh phone call rate limits
-- Migration: 20260630120000_add_dograh_rate_limits.sql
-- ============================================================

-- Tool/workflow state used by the Dograh phone-call integration.
ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS dograh_call_time_tool_uuid TEXT,
  ADD COLUMN IF NOT EXISTS dograh_rate_limit_tool_uuid TEXT,
  ADD COLUMN IF NOT EXISTS dograh_capacity_workflow_id TEXT,
  ADD COLUMN IF NOT EXISTS dograh_outbound_cooldown_seconds INTEGER NOT NULL DEFAULT 10 CHECK (dograh_outbound_cooldown_seconds BETWEEN 0 AND 300),
  ADD COLUMN IF NOT EXISTS dograh_outbound_hourly_cap INTEGER NOT NULL DEFAULT 20 CHECK (dograh_outbound_hourly_cap BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS dograh_inbound_cooldown_seconds INTEGER NOT NULL DEFAULT 10 CHECK (dograh_inbound_cooldown_seconds BETWEEN 0 AND 300),
  ADD COLUMN IF NOT EXISTS dograh_inbound_hourly_cap INTEGER NOT NULL DEFAULT 20 CHECK (dograh_inbound_hourly_cap BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS dograh_inbound_active_workflow TEXT NOT NULL DEFAULT 'normal' CHECK (dograh_inbound_active_workflow IN ('normal', 'capacity')),
  ADD COLUMN IF NOT EXISTS dograh_inbound_rate_limited_until TIMESTAMPTZ;

-- Durable accepted-attempt log for inbound rate limiting. Rejected calls hit Dograh's
-- capacity workflow directly and intentionally do not create rows here; this table tracks the
-- calls that were allowed into the normal receptionist workflow and therefore count toward the
-- rolling hourly cap / cooldown decision for the next call.
CREATE TABLE IF NOT EXISTS public.phone_call_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS phone_call_attempts_bot_created_idx
  ON public.phone_call_attempts (bot_id, direction, created_at DESC);

ALTER TABLE public.phone_call_attempts ENABLE ROW LEVEL SECURITY;

-- Server-side service-role code writes and reads this table. Owners do not need raw access to
-- the attempt log; aggregate/status information comes through authenticated API routes.

NOTIFY pgrst, 'reload schema';
