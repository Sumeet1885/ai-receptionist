import React from 'react';
import { Bot, Lead } from '../../types';

interface StatsCardsProps {
  activeBot: Bot;
  leads: Lead[];
}

export const StatsCards: React.FC<StatsCardsProps> = ({ activeBot, leads }) => {
  const botLeads = leads.filter(l => l.botId === activeBot.id);
  const hotLeads = botLeads.filter(l => l.leadScore === 'HOT');

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
      <div className="bg-brand-card p-5 rounded-xl border border-brand-border shadow-sm">
        <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider font-mono">Total Leads Captured</p>
        <div className="flex items-baseline mt-3 space-x-2">
          <span className="text-3xl font-display font-extrabold text-brand-text">
            {botLeads.length}
          </span>
          <span className="text-xs text-brand-success border border-brand-success/30 bg-brand-success/10 px-1.5 py-0.5 rounded font-mono">Live Synced</span>
        </div>
      </div>

      <div className="bg-brand-card p-5 rounded-xl border border-brand-border shadow-sm">
        <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider font-mono">Hot Leads Count</p>
        <div className="flex items-baseline mt-3 space-x-2">
          <span className="text-3xl font-display font-extrabold text-brand-danger">
            {hotLeads.length}
          </span>
          <span className="text-xs text-brand-muted font-sans">Require Callback</span>
        </div>
      </div>

      <div className="bg-brand-card p-5 rounded-xl border border-brand-border shadow-sm">
        <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider font-mono">Languages Active</p>
        <div className="flex flex-wrap gap-1.5 mt-3.5">
          {activeBot.languages.map(lang => (
            <span key={lang} className="px-2 py-0.5 bg-brand-bg border border-brand-border text-brand-accent text-[10px] font-bold rounded font-mono">
              {lang}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-brand-card p-5 rounded-xl border border-brand-border shadow-sm">
        <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider font-mono">CRM Sync Status</p>
        <div className="flex items-center mt-4 text-brand-success text-xs font-bold space-x-2 font-mono">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-success animate-ping"></span>
          <span>Direct Webhook Active</span>
        </div>
      </div>
    </div>
  );
};
