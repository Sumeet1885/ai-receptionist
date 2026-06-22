import React, { useEffect } from 'react';
import { Icons } from '../common/Icons';
import { ChatSession } from '../../types';
import { useConversations } from '../../hooks/useConversations';

interface ConversationDetailProps {
  session: ChatSession;
  onBack: () => void;
}

export const ConversationDetail: React.FC<ConversationDetailProps> = ({ session, onBack }) => {
  const { messages, fetchMessagesForSession, loading } = useConversations();

  useEffect(() => {
    fetchMessagesForSession(session.id);
  }, [session.id, fetchMessagesForSession]);

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl shadow-sm flex flex-col h-[600px]">
      <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between bg-brand-bg/40 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-1.5 bg-brand-bg border border-brand-border hover:bg-brand-border rounded-lg transition"
          >
            <Icons.ArrowLeft />
          </button>
          <div>
            <h3 className="font-display font-bold text-brand-text text-lg">
              Transcript: {session.visitorId}
            </h3>
            <p className="text-xs text-brand-muted font-mono">{session.startedAt}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <p className="text-sm font-sans animate-pulse text-brand-muted">Loading transcript...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-brand-muted">
            <p>No messages found in this session.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl p-4 font-sans text-sm shadow-sm ${
                msg.sender === 'user' 
                  ? 'bg-brand-accent text-brand-bg rounded-tr-sm' 
                  : 'bg-brand-bg border border-brand-border text-brand-text rounded-tl-sm'
              }`}>
                <div className="whitespace-pre-wrap">{msg.text}</div>
                <div className={`text-[10px] mt-2 font-mono ${msg.sender === 'user' ? 'text-brand-bg/70' : 'text-brand-muted/70'}`}>
                  {msg.timestamp}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
