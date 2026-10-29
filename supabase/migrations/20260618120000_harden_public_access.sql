-- Anonymous visitors use the Express widget API. Direct database access remains
-- available only through authenticated owner policies and the backend service role.
DROP POLICY IF EXISTS "public_bot_read" ON public.bots;
DROP POLICY IF EXISTS "public_session_insert" ON public.chat_sessions;
DROP POLICY IF EXISTS "public_message_insert" ON public.messages;

CREATE INDEX IF NOT EXISTS bots_owner_id_idx ON public.bots (owner_id);
CREATE INDEX IF NOT EXISTS chat_sessions_bot_id_idx ON public.chat_sessions (bot_id);
CREATE INDEX IF NOT EXISTS messages_session_id_idx ON public.messages (session_id);

DROP POLICY IF EXISTS "owner_session_insert" ON public.chat_sessions;
CREATE POLICY "owner_session_insert" ON public.chat_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    bot_id IN (SELECT id FROM public.bots WHERE owner_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "owner_message_insert" ON public.messages;
CREATE POLICY "owner_message_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT session.id
      FROM public.chat_sessions session
      JOIN public.bots bot ON bot.id = session.bot_id
      WHERE bot.owner_id = (SELECT auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
