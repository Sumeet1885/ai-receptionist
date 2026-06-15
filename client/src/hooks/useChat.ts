import { useState, useRef } from 'react';
import { Message } from '../types';
import { supabase } from '../lib/supabaseClient';
import { speakText } from '../services/speech';

export function useChat() {
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isBotResponding, setIsBotResponding] = useState(false);
  const [showSpeech, setShowSpeech] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const startSession = async (botId: string, greeting: string) => {
    const visitorId = localStorage.getItem('visitor_id') || `visitor-${Date.now()}`;
    localStorage.setItem('visitor_id', visitorId);

    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert([{ bot_id: botId, visitor_id: visitorId }])
        .select('id')
        .single();

      if (!error && data) {
        setCurrentSessionId(data.id);
        await supabase.from('messages').insert([{
          session_id: data.id,
          sender: 'bot',
          content: greeting
        }]);
      }
    } catch (e) {
      console.warn('Could not create remote session', e);
    }

    setChatMessages([{
      id: '1',
      sender: 'bot',
      text: greeting,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
  };

  const sendMessage = async (
    e: React.FormEvent,
    onError: (msg: string) => void
  ) => {
    e.preventDefault();
    if (!chatInput.trim() || !currentSessionId) return;

    const userText = chatInput;
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsBotResponding(true);

    try {
      const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';
      const response = await fetch(`${expressUrl}/api/chat/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId: currentSessionId, userMessage: userText })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const botResponseText = data.reply || 'Thank you for the message. I am analyzing the details to get back to you.';
      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: botResponseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setChatMessages(prev => [...prev, botMsg]);

      if (showSpeech) {
        speakText(botResponseText, () => onError('Speech synthesis not supported in this browser'));
      }
    } catch (err) {
      console.error('Error calling chat-reply:', err);
      onError('Connection to agent failed. Check your network.');
      setChatMessages(prev => [...prev, {
        id: 'err',
        sender: 'bot',
        text: 'Sorry, I am having trouble connecting to my brain right now.',
        timestamp: ''
      }]);
    } finally {
      setIsBotResponding(false);
    }
  };

  return {
    chatMessages, setChatMessages,
    chatInput, setChatInput,
    isBotResponding,
    showSpeech, setShowSpeech,
    currentSessionId,
    messageEndRef,
    startSession,
    sendMessage
  };
}
