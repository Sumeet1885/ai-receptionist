-- ============================================================
-- AI Receptionist — Inbound phone calls via Dograh
-- Migration: 20260626120000_add_dograh_calls.sql
-- ============================================================

-- ── bots: Dograh provisioning state ─────────────────────────
ALTER TABLE bots
  ADD COLUMN dograh_workflow_id         TEXT,
  ADD COLUMN dograh_telephony_config_id TEXT,
  ADD COLUMN dograh_phone_number_id     TEXT,
  ADD COLUMN dograh_phone_number        TEXT;

-- One Dograh number can never be bound to two bots. Dograh itself is a single
-- org/service-account instance, so tenant isolation across bots is enforced here.
CREATE UNIQUE INDEX bots_dograh_phone_number_id_key
  ON bots (dograh_phone_number_id)
  WHERE dograh_phone_number_id IS NOT NULL;

-- ── chat_sessions: distinguish channel ───────────────────────
ALTER TABLE chat_sessions
  ADD COLUMN channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'phone'));

-- ── phone_calls: one row per Dograh run ───────────────────────
CREATE TABLE phone_calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id            UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  session_id        UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  dograh_workflow_id TEXT,
  dograh_run_id     TEXT NOT NULL UNIQUE,
  ingest_status     TEXT NOT NULL DEFAULT 'pending' CHECK (ingest_status IN ('pending', 'done', 'failed')),
  caller_number     TEXT,
  status            TEXT,
  duration_seconds  INTEGER,
  recording_url     TEXT,
  transcript_url    TEXT,
  cost_info         JSONB,
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE phone_calls ENABLE ROW LEVEL SECURITY;
-- Owner can read phone call records for their bots. All writes go through the
-- service role (server-side mirroring), so no insert/update policy is needed.
CREATE POLICY "owner_phone_calls_read" ON phone_calls
  FOR SELECT USING (
    bot_id IN (SELECT id FROM bots WHERE owner_id = auth.uid())
  );
