-- ============================================================
-- Migration: 20261031140000_isolate_customer_leads.sql
-- Description:
--   1. Allows bots.owner_id to be NULL when unassigned.
--   2. Adds customer_id to leads and chat_sessions for strict customer isolation.
--   3. Updates RLS policies so customers retain ownership of their acquired leads
--      (customer_id = auth.uid()) while preventing cross-tenant leakage upon persona reassignment.
--   4. Safely ensures phone_number column exists on bots.
-- ============================================================

-- 1. Allow bots.owner_id to be nullable so unassign genuinely detaches ownership
ALTER TABLE bots ALTER COLUMN owner_id DROP NOT NULL;

-- 2. Safely ensure phone_number column exists on bots
ALTER TABLE bots ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- 3. Add customer_id to leads and chat_sessions
ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. Backfill existing records with the bot's current owner
UPDATE leads l
SET customer_id = b.owner_id
FROM bots b
WHERE l.bot_id = b.id AND l.customer_id IS NULL AND b.owner_id IS NOT NULL;

UPDATE chat_sessions cs
SET customer_id = b.owner_id
FROM bots b
WHERE cs.bot_id = b.id AND cs.customer_id IS NULL AND b.owner_id IS NOT NULL;

-- 5. Create index for fast customer lead querying
CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON leads (customer_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_customer_id ON chat_sessions (customer_id);

-- 6. Update Row Level Security (RLS) policies for leads:
-- Decoupled ownership: customers retain all leads they acquired (customer_id = auth.uid())
-- even if the bot is subsequently unassigned, paused, or reassigned.
DROP POLICY IF EXISTS "owner_leads" ON leads;
CREATE POLICY "owner_leads" ON leads
  FOR ALL USING (
    customer_id = auth.uid()
    OR (customer_id IS NULL AND bot_id IN (SELECT id FROM bots WHERE owner_id = auth.uid()))
  )
  WITH CHECK (
    customer_id = auth.uid()
    OR (customer_id IS NULL AND bot_id IN (SELECT id FROM bots WHERE owner_id = auth.uid()))
  );

-- 7. Update Row Level Security (RLS) policies for chat_sessions
DROP POLICY IF EXISTS "owner_session_read" ON chat_sessions;
CREATE POLICY "owner_session_read" ON chat_sessions
  FOR SELECT USING (
    customer_id = auth.uid()
    OR (customer_id IS NULL AND bot_id IN (SELECT id FROM bots WHERE owner_id = auth.uid()))
  );

NOTIFY pgrst, 'reload schema';

