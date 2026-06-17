import React from 'react';
import { Bot } from '../../types';
import { Icons } from '../common/Icons';

interface BotSettingsProps {
  bots: Bot[];
  setBots: React.Dispatch<React.SetStateAction<Bot[]>>;
  activeBot: Bot;
  showToast: (message: string, type?: 'success' | 'error') => void;
  updateBot: (id: string, updates: Partial<{
    businessName: string;
    industry: string;
    greeting: string;
    primaryColor: string;
    languages: string[];
    knowledgeBase: string;
    allowedDomains: string[];
  }>) => Promise<void>;
}

export const BotSettings: React.FC<BotSettingsProps> = ({ bots, setBots, activeBot, showToast, updateBot }) => {
  return (
    <div className="bg-brand-card p-4 sm:p-8 rounded-xl border border-brand-border space-y-6 shadow-sm">
      <h3 className="text-xl font-display font-bold text-brand-text border-b border-brand-border pb-3 flex items-center">
        <Icons.Settings />
        <span className="ml-2">Live Refinement & FAQ Expansion</span>
      </h3>

      <div>
        <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-mono">Configure Web Greeting</label>
        <input
          type="text"
          value={activeBot.greeting}
          onChange={(e) => {
            const updated = bots.map(b => b.id === activeBot.id ? { ...b, greeting: e.target.value } : b);
            setBots(updated);
          }}
          className="w-full bg-brand-bg border border-brand-border rounded-md px-4 py-3 text-brand-text focus:outline-none focus:border-brand-accent transition font-sans text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-mono">Modify Active Knowledge Base</label>
        <textarea
          rows={8}
          value={activeBot.knowledgeBase}
          onChange={(e) => {
            const updated = bots.map(b => b.id === activeBot.id ? { ...b, knowledgeBase: e.target.value } : b);
            setBots(updated);
          }}
          className="w-full bg-brand-bg border border-brand-border rounded-md px-4 py-3 text-brand-text text-sm font-sans leading-relaxed focus:outline-none focus:border-brand-accent transition"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-mono">Allowed Widget Domains (CORS)</label>
        <p className="text-[10px] text-brand-muted mb-2 font-sans">
          Enter comma-separated domains (e.g. <code>https://example.com, http://localhost:3000</code>). If empty, all domains are allowed.
        </p>
        <input
          type="text"
          value={activeBot.allowedDomains?.join(', ') || ''}
          onChange={(e) => {
            const val = e.target.value;
            const arr = val ? val.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];
            const updated = bots.map(b => b.id === activeBot.id ? { ...b, allowedDomains: arr } : b);
            setBots(updated);
          }}
          placeholder="https://example.com"
          className="w-full bg-brand-bg border border-brand-border rounded-md px-4 py-3 text-brand-text focus:outline-none focus:border-brand-accent transition font-sans text-sm"
        />
      </div>

      <div className="pt-4 border-t border-brand-border flex justify-end">
        <button
          onClick={async () => {
            try {
              await updateBot(activeBot.id, {
                greeting: activeBot.greeting,
                knowledgeBase: activeBot.knowledgeBase,
                allowedDomains: activeBot.allowedDomains
              });
              showToast("Knowledge Base changes processed successfully!");
            } catch (err: any) {
              console.error("Failed to save knowledge base:", err);
              showToast("Failed to save changes: " + (err.message || err), "error");
            }
          }}
          className="px-6 py-2.5 bg-brand-accent hover:bg-brand-accent-hover border border-brand-border text-brand-text font-sans font-bold rounded-lg transition duration-200"
        >
          Save Knowledge Base
        </button>
      </div>
    </div>
  );
};
