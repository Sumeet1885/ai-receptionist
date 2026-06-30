import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migrationUrl = new URL('../supabase/migrations/20260618120000_harden_public_access.sql', import.meta.url);
const oauthMigrationUrl = new URL('../supabase/migrations/20260618121000_secure_calendar_oauth.sql', import.meta.url);

test('production migration removes anonymous bot reads and visitor database writes', async () => {
  const sql = await readFile(fileURLToPath(migrationUrl), 'utf8');

  assert.match(sql, /DROP POLICY IF EXISTS "public_bot_read" ON public\.bots/i);
  assert.match(sql, /DROP POLICY IF EXISTS "public_session_insert" ON public\.chat_sessions/i);
  assert.match(sql, /DROP POLICY IF EXISTS "public_message_insert" ON public\.messages/i);
  assert.doesNotMatch(sql, /DROP POLICY IF EXISTS "owner_bots_crud"/i);
  assert.doesNotMatch(sql, /DROP POLICY IF EXISTS "owner_session_read"/i);
  assert.doesNotMatch(sql, /DROP POLICY IF EXISTS "owner_message_read"/i);
  assert.match(sql, /CREATE POLICY "owner_session_insert" ON public\.chat_sessions/i);
  assert.match(sql, /CREATE POLICY "owner_message_insert" ON public\.messages/i);
  assert.match(sql, /owner_id = \(SELECT auth\.uid\(\)\)/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS bots_owner_id_idx ON public\.bots \(owner_id\)/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS chat_sessions_bot_id_idx ON public\.chat_sessions \(bot_id\)/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS messages_session_id_idx ON public\.messages \(session_id\)/i);
});

test('OAuth state storage is private and its atomic consume function uses caller privileges', async () => {
  const sql = await readFile(fileURLToPath(oauthMigrationUrl), 'utf8');

  assert.match(sql, /ALTER TABLE public\.calendar_oauth_states ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.calendar_oauth_states FROM anon, authenticated/i);
  assert.match(sql, /GRANT SELECT, INSERT, DELETE ON TABLE public\.calendar_oauth_states TO service_role/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS calendar_oauth_states_owner_id_idx[\s\S]*ON public\.calendar_oauth_states \(owner_id\)/i);
  assert.doesNotMatch(sql, /SECURITY DEFINER/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.consume_calendar_oauth_state\(TEXT, TEXT\) TO service_role/i);
});
