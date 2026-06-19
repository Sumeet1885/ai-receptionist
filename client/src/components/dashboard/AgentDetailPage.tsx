import React from 'react';
import { Bot, WidgetConfig } from '../../types';
import { BotSettings } from './BotSettings';
import { EmbedCodePanel } from './EmbedCodePanel';
import { Icons } from '../common/Icons';

interface AgentDetailPageProps {
  bots: Bot[];
  setBots: React.Dispatch<React.SetStateAction<Bot[]>>;
  activeBot: Bot;
  tab: 'overview' | 'knowledge' | 'install' | 'preview';
  navigate: (path: string) => void;
  launchPublicChat: (botId: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  updateBot: (id: string, updates: Partial<{
    businessName: string;
    industry: string;
    greeting: string;
    primaryColor: string;
    knowledgeBase: string;
    allowedDomains: string[];
    widgetConfig: WidgetConfig;
  }>) => Promise<void>;
}

export const AgentDetailPage: React.FC<AgentDetailPageProps> = ({
  bots,
  setBots,
  activeBot,
  tab,
  navigate,
  launchPublicChat,
  showToast,
  updateBot
}) => {
  const tabs: Array<{ id: AgentDetailPageProps['tab']; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'knowledge', label: 'Customize' },
    { id: 'install', label: 'Install' },
    { id: 'preview', label: 'Preview' }
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 bg-brand-card border border-brand-border rounded-lg p-1">
        {tabs.map(item => (
          <button
            key={item.id}
            onClick={() => navigate(item.id === 'overview' ? `/agents/${activeBot.id}` : `/agents/${activeBot.id}/${item.id}`)}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition ${tab === item.id ? 'bg-brand-accent text-brand-text' : 'text-brand-muted hover:text-brand-text hover:bg-brand-bg'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
          <section className="bg-brand-card border border-brand-border rounded-lg p-6 space-y-5">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-brand-muted">Agent</p>
              <h3 className="text-2xl font-display font-bold text-brand-text mt-1">{activeBot.businessName}</h3>
              <p className="text-sm text-brand-muted mt-2">{activeBot.greeting}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-brand-bg border border-brand-border rounded-md p-4">
                <p className="text-[10px] font-mono uppercase tracking-wider text-brand-muted">Industry</p>
                <p className="text-sm font-semibold text-brand-text mt-2">{activeBot.industry}</p>
              </div>
              <div className="bg-brand-bg border border-brand-border rounded-md p-4">
                <p className="text-[10px] font-mono uppercase tracking-wider text-brand-muted">Widget Color</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="w-4 h-4 rounded-full border border-brand-border" style={{ background: activeBot.widgetConfig.primaryColor }} />
                  <p className="text-sm font-semibold text-brand-text">{activeBot.widgetConfig.primaryColor}</p>
                </div>
              </div>
              <div className="bg-brand-bg border border-brand-border rounded-md p-4">
                <p className="text-[10px] font-mono uppercase tracking-wider text-brand-muted">Widget Domains</p>
                <p className="text-sm font-semibold text-brand-text mt-2">{activeBot.allowedDomains?.length || 0}</p>
              </div>
            </div>
          </section>

          <aside className="bg-brand-card border border-brand-border rounded-lg p-5 space-y-3">
            <h3 className="font-display font-bold text-lg text-brand-text">Next Actions</h3>
            <button onClick={() => navigate(`/agents/${activeBot.id}/knowledge`)} className="w-full text-left px-3 py-3 bg-brand-bg hover:bg-brand-border border border-brand-border rounded-md text-sm text-brand-text transition">
              Edit knowledge base
            </button>
            <button onClick={() => navigate(`/agents/${activeBot.id}/install`)} className="w-full text-left px-3 py-3 bg-brand-bg hover:bg-brand-border border border-brand-border rounded-md text-sm text-brand-text transition">
              Install on website
            </button>
            <button onClick={() => launchPublicChat(activeBot.id)} className="w-full text-left px-3 py-3 bg-brand-accent hover:bg-brand-accent-hover rounded-md text-sm font-bold text-brand-text transition">
              Preview visitor chat
            </button>
          </aside>
        </div>
      )}

      {tab === 'knowledge' && (
        <BotSettings
          bots={bots}
          setBots={setBots}
          activeBot={activeBot}
          showToast={showToast}
          updateBot={updateBot}
        />
      )}

      {tab === 'install' && (
        <div>
          <EmbedCodePanel
            activeBot={activeBot}
            showToast={showToast}
            launchPublicChat={launchPublicChat}
            updateBot={updateBot}
          />
        </div>
      )}

      {tab === 'preview' && (
        <div className="bg-brand-card border border-brand-border rounded-lg p-8 text-center space-y-4">
          <h3 className="text-xl font-display font-bold text-brand-text">Preview this receptionist</h3>
          <p className="text-sm text-brand-muted max-w-md mx-auto">Open the public chat experience exactly as a visitor would see it.</p>
          <button
            onClick={() => launchPublicChat(activeBot.id)}
            className="px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-hover text-brand-text rounded-lg text-sm font-bold transition"
          >
            Open Preview
          </button>
        </div>
      )}
    </div>
  );
};
