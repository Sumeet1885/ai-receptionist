import React from 'react';
import { Bot } from '../../types';
import { Icons } from '../common/Icons';

interface AgentsPageProps {
  bots: Bot[];
  activeBotId: string;
  setActiveBotId: (id: string) => void;
  navigate: (path: string) => void;
  launchPublicChat: (botId: string) => void;
}

export const AgentsPage: React.FC<AgentsPageProps> = ({
  bots,
  activeBotId,
  setActiveBotId,
  navigate,
  launchPublicChat
}) => {
  if (bots.length === 0) {
    return (
      <div className="bg-brand-card border border-brand-border rounded-lg p-10 text-center text-brand-muted">
        <Icons.Bot />
        <h3 className="text-xl font-display font-bold text-brand-text mt-4">Create your first receptionist</h3>
        <p className="text-sm mt-2">Add business details, FAQs, and a greeting so visitors can start chatting.</p>
        <button
          onClick={() => navigate('/agents/new')}
          className="mt-5 px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-hover text-brand-text rounded-lg text-sm font-bold transition"
        >
          Create Agent
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {bots.map(bot => {
        const isActive = bot.id === activeBotId;
        return (
          <article key={bot.id} className={`bg-brand-card border rounded-lg p-5 shadow-sm space-y-5 ${isActive ? 'border-brand-accent' : 'border-brand-border'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-brand-muted">{bot.industry}</p>
                <h3 className="text-lg font-display font-bold text-brand-text mt-1">{bot.businessName}</h3>
              </div>
              <span className={`w-2.5 h-2.5 rounded-full mt-2 ${isActive ? 'bg-brand-success' : 'bg-brand-muted'}`} />
            </div>

            <p className="text-sm text-brand-muted line-clamp-3">{bot.greeting}</p>

            <div className="bg-brand-bg border border-brand-border rounded-md p-3">
              <p className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Public Link</p>
              <p className="text-xs text-brand-accent mt-1 break-all">/chats/{bot.subDomain}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  setActiveBotId(bot.id);
                  navigate(`/agents/${bot.id}`);
                }}
                className="px-3 py-2 bg-brand-accent hover:bg-brand-accent-hover rounded-md text-xs font-bold text-brand-text transition"
              >
                Manage
              </button>
              <button
                onClick={() => launchPublicChat(bot.id)}
                className="px-3 py-2 bg-brand-bg hover:bg-brand-border border border-brand-border rounded-md text-xs font-semibold text-brand-text transition"
              >
                Preview
              </button>
              <button
                onClick={() => {
                  setActiveBotId(bot.id);
                  navigate(`/agents/${bot.id}/install`);
                }}
                className="px-3 py-2 bg-brand-bg hover:bg-brand-border border border-brand-border rounded-md text-xs font-semibold text-brand-text transition"
              >
                Install
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
};
