import React, { useEffect, useState } from 'react';
import { Icons } from '../common/Icons';
import { useConversations } from '../../hooks/useConversations';
import { ConversationDetail } from './ConversationDetail';

interface ConversationListProps {
  activeBotId: string;
}

export const ConversationList: React.FC<ConversationListProps> = ({ activeBotId }) => {
  const { sessions, fetchSessions, loading } = useConversations();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (activeBotId) {
      fetchSessions(activeBotId);
      setSelectedSessionId(null);
    }
  }, [activeBotId, fetchSessions]);

  if (selectedSessionId) {
    const session = sessions.find(s => s.id === selectedSessionId);
    return (
      <ConversationDetail 
        session={session!} 
        onBack={() => setSelectedSessionId(null)} 
      />
    );
  }

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between bg-brand-bg/40">
        <h3 className="font-display font-bold text-brand-text text-lg flex items-center">
          <Icons.Chat />
          <span className="ml-2">Chat Sessions</span>
        </h3>
        <button 
          onClick={() => fetchSessions(activeBotId)}
          className="text-xs font-mono text-brand-accent hover:text-brand-accent-hover transition flex items-center space-x-1"
        >
          <Icons.Refresh />
          <span>Refresh</span>
        </button>
      </div>

      <div className="divide-y divide-brand-border">
        {loading ? (
          <div className="p-12 text-center text-brand-muted space-y-4">
            <p className="text-sm font-sans animate-pulse">Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-12 text-center text-brand-muted space-y-4">
            <Icons.Chat />
            <p className="text-sm font-sans">No chat sessions recorded yet.</p>
          </div>
        ) : (
          sessions.map((session) => (
            <div 
              key={session.id} 
              onClick={() => setSelectedSessionId(session.id)}
              className="p-6 hover:bg-brand-bg/20 transition cursor-pointer flex flex-col md:flex-row justify-between gap-4"
            >
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-display font-bold text-brand-text truncate max-w-[140px] sm:max-w-xs">{session.visitorId}</h4>
                  <span className="text-xs text-brand-muted font-mono">{session.startedAt}</span>
                  <span className="px-2 py-1 bg-brand-bg border border-brand-border text-brand-muted text-[10px] font-bold rounded font-mono">
                    {session.messageCount} msgs
                  </span>
                </div>
                <p className="text-sm text-brand-muted font-sans truncate pr-4">
                  "{session.lastMessage}"
                </p>
              </div>
              <div className="flex items-center shrink-0">
                <Icons.ArrowRight />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
