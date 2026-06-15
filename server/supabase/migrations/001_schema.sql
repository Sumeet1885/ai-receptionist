-- ============================================================
-- AI Receptionist — Supabase Database Schema
-- Migration: 001_schema.sql
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────
-- Auto-created for every new auth.users row via trigger
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  company     TEXT,
  plan        TEXT DEFAULT 'free',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── bots ─────────────────────────────────────────────────────
CREATE TABLE bots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name  TEXT NOT NULL,
  industry       TEXT NOT NULL,
  subdomain      TEXT NOT NULL UNIQUE,
  greeting       TEXT NOT NULL,
  knowledge_base TEXT NOT NULL,
  primary_color  TEXT DEFAULT 'indigo',
  languages      TEXT[] DEFAULT ARRAY['English'],
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
-- Owner can create, read, update, delete their own bots
CREATE POLICY "owner_bots_crud" ON bots
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
-- Public can read any active bot (needed by visitor chat widget)
CREATE POLICY "public_bot_read" ON bots
  FOR SELECT USING (is_active = TRUE);

-- ── chat_sessions ─────────────────────────────────────────────
CREATE TABLE chat_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  visitor_id  TEXT,   -- client-generated UUID stored in localStorage
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
-- Any visitor can open a new session (no login required)
CREATE POLICY "public_session_insert" ON chat_sessions
  FOR INSERT WITH CHECK (TRUE);
-- Owner can read sessions for their bots
CREATE POLICY "owner_session_read" ON chat_sessions
  FOR SELECT USING (
    bot_id IN (SELECT id FROM bots WHERE owner_id = auth.uid())
  );

-- ── messages ─────────────────────────────────────────────────
CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sender     TEXT NOT NULL CHECK (sender IN ('user', 'bot')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- Anyone can insert messages (visitor sends, Edge Function saves bot reply)
CREATE POLICY "public_message_insert" ON messages
  FOR INSERT WITH CHECK (TRUE);
-- Owner can read messages in their bot sessions
CREATE POLICY "owner_message_read" ON messages
  FOR SELECT USING (
    session_id IN (
      SELECT cs.id FROM chat_sessions cs
      JOIN bots b ON cs.bot_id = b.id
      WHERE b.owner_id = auth.uid()
    )
  );

-- ── leads ────────────────────────────────────────────────────
CREATE TABLE leads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id             UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  session_id         UUID NOT NULL UNIQUE REFERENCES chat_sessions(id) ON DELETE CASCADE,
  name               TEXT DEFAULT 'Anonymous',
  phone              TEXT DEFAULT 'Not Provided',
  requirement        TEXT DEFAULT 'General Inquiry',
  budget             TEXT DEFAULT 'N/A',
  sentiment          TEXT DEFAULT 'Neutral',
  lead_score         TEXT DEFAULT 'COLD' CHECK (lead_score IN ('HOT', 'WARM', 'COLD')),
  summary            TEXT,
  appointment_status TEXT DEFAULT 'None',
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
-- Owner can read, update, delete leads from their bots
CREATE POLICY "owner_leads" ON leads
  USING (bot_id IN (SELECT id FROM bots WHERE owner_id = auth.uid()))
  WITH CHECK (bot_id IN (SELECT id FROM bots WHERE owner_id = auth.uid()));
