import React from 'react';
import { Bot } from '../../types';
import { Icons } from '../common/Icons';

interface BotSettingsProps {
  bots: Bot[];
  setBots: React.Dispatch<React.SetStateAction<Bot[]>>;
  activeBot: Bot;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const BotSettings: React.FC<BotSettingsProps> = ({ bots, setBots, activeBot, showToast }) => {
  return (
    <div className="bg-brand-card p-8 rounded-xl border border-brand-border space-y-6 shadow-sm">
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

      <div className="pt-4 border-t border-brand-border flex justify-end">
        <button
          onClick={() => {
            showToast("Knowledge Base changes processed successfully!");
          }}
          className="px-6 py-2.5 bg-brand-accent hover:bg-brand-accent-hover border border-brand-border text-brand-text font-sans font-bold rounded-lg transition duration-200"
        >
          Save Knowledge Base
        </button>
      </div>
    </div>
  );
};
