import React from 'react';
import { Bot, Lead } from '../../types';

interface StatsCardsProps {
  activeBot: Bot;
  leads: Lead[];
}

export const StatsCards: React.FC<StatsCardsProps> = ({ activeBot, leads }) => {
  const botLeads = leads.filter(l => l.botId === activeBot.id && l.leadScore !== 'COLD');
  const hotLeads = botLeads.filter(l => l.leadScore === 'HOT');

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
      <div className="bg-brand-card p-5 rounded-2xl border border-brand-border/70 shadow-sm card-hover-glow relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-brand-accent/5 rounded-full blur-xl group-hover:bg-brand-accent/10 transition-all pointer-events-none" />
        <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider font-body">Total Leads Captured</p>
        <div className="flex items-baseline mt-3 space-x-2">
          <span className="text-3xl font-display font-black text-brand-text font-body">
            {botLeads.length}
          </span>
          <span className="text-[11px] text-emerald-700 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-full font-body font-bold">● Live Synced</span>
        </div>
      </div>

      <div className={`p-5 rounded-2xl border shadow-sm card-hover-glow transition-all relative overflow-hidden ${
        hotLeads.length > 0
          ? 'bg-brand-card hot-card-glow'
          : 'bg-brand-card border-brand-border/70'
      }`}>
        <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider font-body flex items-center justify-between">
          <span className={hotLeads.length > 0 ? 'text-rose-700 font-bold' : ''}>Hot Leads Count</span>
          {hotLeads.length > 0 && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-[10px] font-body text-rose-700 font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>Priority</span>
            </span>
          )}
        </p>
        <div className="flex items-baseline mt-3 space-x-2">
          <span className={`text-3xl font-display font-black font-body ${
            hotLeads.length > 0 ? 'text-rose-700 drop-shadow-[0_0_15px_rgba(244,63,94,0.6)]' : 'text-brand-text'
          }`}>
            {hotLeads.length}
          </span>
          <span className="text-xs text-brand-muted font-sans font-medium">Require Callback</span>
        </div>
      </div>

      <div 
        className="bg-brand-card p-5 rounded-2xl border border-brand-border/70 card-hover-glow transition cursor-pointer shadow-sm group relative overflow-hidden"
        onClick={() => { window.location.href = '/plans'; }}
        title="View calling plans and live minute usage"
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-brand-accent/5 rounded-full blur-xl group-hover:bg-brand-accent/15 transition-all pointer-events-none" />
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider font-body">Voice Minutes</p>
          <span className="text-[10px] font-body text-brand-accent font-bold group-hover:underline">Plans →</span>
        </div>
        <div className="flex items-baseline mt-3 space-x-2">
          <span className="text-3xl font-display font-black text-brand-text font-body">
            {botLeads.reduce((acc, l) => {
              const dur = l.durationSeconds || 0;
              if (dur <= 0) return acc;
              if (dur < 25) return acc + 0.5;
              return acc + Math.max(1, Math.ceil(dur / 60));
            }, 0).toFixed(1)}
          </span>
          <span className="text-xs text-brand-muted font-body font-semibold">
            / {200 + (parseInt(localStorage.getItem('ai_receptionist_topup_minutes') || '0', 10) || 0)} Mins
          </span>
        </div>
        <div className="mt-2 text-[11px] text-brand-muted font-sans flex items-center justify-between">
          <span>Growth Plan (₹1,299)</span>
          <span className="text-emerald-700 font-body font-bold">Active</span>
        </div>
      </div>

      <div className="bg-brand-card p-5 rounded-2xl border border-brand-border/70 shadow-sm card-hover-glow">
        <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider font-body">CRM Sync Status</p>
        <div className="flex items-center mt-4 text-emerald-700 text-xs font-bold space-x-2 font-body">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Direct Webhook Active</span>
        </div>
      </div>
    </div>
  );
};
