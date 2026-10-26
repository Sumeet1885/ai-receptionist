import { ChatSession } from '../types';

export interface ConversationSessionRow {
  id: string;
  bot_id: string;
  visitor_id: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface ConversationMessageRow {
  session_id: string;
  content: string;
}

export function mapConversationSessions(
  sessionRows: ConversationSessionRow[],
  messageRows: ConversationMessageRow[],
): ChatSession[] {
  const summaries = messageRows.reduce<Record<string, { count: number; lastMessage: string }>>((result, message) => {
    const current = result[message.session_id] || { count: 0, lastMessage: '' };
    result[message.session_id] = {
      count: current.count + 1,
      lastMessage: message.content,
    };
    return result;
  }, {});

  return sessionRows.map(session => ({
    id: session.id,
    botId: session.bot_id,
    visitorId: session.visitor_id || 'Anonymous visitor',
    startedAt: new Date(session.started_at).toLocaleString(),
    endedAt: session.ended_at ? new Date(session.ended_at).toLocaleString() : null,
    lastMessage: summaries[session.id]?.lastMessage || 'No messages yet',
    messageCount: summaries[session.id]?.count || 0,
  }));
}

