import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
export function useConversations() {
    const [sessions, setSessions] = useState([]);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const fetchSessions = useCallback(async (botId) => {
        setLoading(true);
        // Fetch sessions
        const { data: sessionData, error: sessionError } = await supabase
            .from('chat_sessions')
            .select('id, bot_id, visitor_id, created_at, ended_at')
            .eq('bot_id', botId)
            .order('created_at', { ascending: false });
        if (sessionError || !sessionData) {
            setLoading(false);
            return;
        }
        // Since we don't have a direct last_message column, we'll fetch message counts and latest messages
        // To be efficient, we do a join if possible, or fetch all messages for these sessions.
        // For now, let's fetch messages for the latest few sessions to get snippets.
        const sessionIds = sessionData.map(s => s.id);
        let messagesMap = {};
        if (sessionIds.length > 0) {
            const { data: msgData } = await supabase
                .from('messages')
                .select('session_id, content, created_at')
                .in('session_id', sessionIds)
                .order('created_at', { ascending: true });
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
        const mapped = sessionData.map(s => ({
            id: s.id,
            botId: s.bot_id,
            visitorId: s.visitor_id,
            startedAt: new Date(s.created_at).toLocaleString(),
            endedAt: s.ended_at ? new Date(s.ended_at).toLocaleString() : null,
            lastMessage: messagesMap[s.id]?.lastMsg || 'No messages yet',
            messageCount: messagesMap[s.id]?.count || 0
        }));
        setSessions(mapped);
        setLoading(false);
    }, []);
    const fetchMessagesForSession = useCallback(async (sessionId) => {
        setLoading(true);
        const { data, error } = await supabase
            .from('messages')
            .select('id, sender, content, created_at')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });
        if (!error && data) {
            setMessages(data.map(m => ({
                id: m.id,
                sender: m.sender,
                text: m.content,
                timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            })));
        }
        else {
            setMessages([]);
        }
        setLoading(false);
    }, []);
    return { sessions, messages, loading, fetchSessions, fetchMessagesForSession };
}
