export async function loadLiveSessionContext(db: any, botId: string, sessionId: string) {
  const { data: session, error: sessionError } = await db
    .from('chat_sessions')
    .select('bot_id')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) throw new Error('Chat session not found');
  if (session.bot_id !== botId) throw new Error('Chat session does not belong to this bot');

  const { data: bot, error: botError } = await db
    .from('bots')
    .select('*')
    .eq('id', botId)
    .eq('is_active', true)
    .single();

  if (botError || !bot) throw new Error('Bot not found or inactive');
  return { bot };
}
