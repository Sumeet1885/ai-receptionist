import { useState, useCallback } from 'react';
import { ChatSession, Message } from '../types';
import { supabase } from '../lib/supabaseClient';
import { mapConversationSessions } from '../lib/conversations';

export function useConversations() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async (botId?: string | 'all') => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from('chat_sessions')
      .select('id, bot_id, visitor_id, started_at, ended_at')
      .order('started_at', { ascending: false });

    if (botId && botId !== 'all') {
      query = query.eq('bot_id', botId);
    }

    const { data: sessionData, error: sessionError } = await query;

    if (sessionError || !sessionData) {
      setSessions([]);
      setError(sessionError?.message || 'Could not load conversations.');
      setLoading(false);
      return;
    }

    // Since we don't have a direct last_message column, we'll fetch message counts and latest messages
    // To be efficient, we do a join if possible, or fetch all messages for these sessions.
    // For now, let's fetch messages for the latest few sessions to get snippets.
    const sessionIds = sessionData.map(s => s.id);
    
    let messagesMap: Record<string, { count: number, lastMsg: string }> = {};
    if (sessionIds.length > 0) {
      const { data: msgData, error: messageError } = await supabase
        .from('messages')
        .select('session_id, content, created_at')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: true });

      if (messageError) {
        setSessions([]);
        setError(messageError.message || 'Could not load conversation messages.');
        setLoading(false);
        return;
      }
        
      if (msgData) {
        msgData.forEach(m => {
          if (!messagesMap[m.session_id]) {
            messagesMap[m.session_id] = { count: 0, lastMsg: '' };
          }
          messagesMap[m.session_id].count++;
          messagesMap[m.session_id].lastMsg = m.content;
        });
      }
    }

    const messageRows = Object.entries(messagesMap).flatMap(([sessionId, summary]) =>
      Array.from({ length: summary.count }, (_, index) => ({
        session_id: sessionId,
        content: index === summary.count - 1 ? summary.lastMsg : '',
      }))
    );
    const mapped: ChatSession[] = mapConversationSessions(sessionData, messageRows);

    setSessions(mapped);
    setLoading(false);
  }, []);

  const fetchMessagesForSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data.map(m => ({
        id: m.id,
        sender: m.sender as 'user' | 'bot',
        text: m.content,
        timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      })));
    } else {
      setMessages([]);
      setError(error?.message || 'Could not load conversation messages.');
    }
    setLoading(false);
  }, []);

  return { sessions, messages, loading, error, fetchSessions, fetchMessagesForSession };
}
