import React from 'react';
import { Bot, Lead } from '../../types';
import { Icons } from '../common/Icons';
import { LeadTable } from './LeadTable';

interface LeadsWorkspaceProps {
  bots: Bot[];
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  selectedBotId: string | 'all';
  setSelectedBotId: (id: string | 'all') => void;
  launchPublicChat: (botId: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const LeadsWorkspace: React.FC<LeadsWorkspaceProps> = ({
  bots,
  leads,
  setLeads,
  selectedBotId,
  setSelectedBotId,
  launchPublicChat,
  showToast
}) => {
  const getLeadCount = (botId: string | 'all') => (
    botId === 'all' ? leads.length : leads.filter(lead => lead.botId === botId).length
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
      <aside className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm lg:sticky lg:top-24">
        <div className="px-4 py-4 border-b border-brand-border bg-brand-bg/40">
          <h3 className="font-display font-bold text-brand-text text-base flex items-center">
            <Icons.Bot />
            <span className="ml-2">Agents</span>
          </h3>
        </div>

        <div className="p-3 space-y-2">
          <button
            onClick={() => setSelectedBotId('all')}
            className={`w-full text-left px-3 py-3 rounded-md border transition ${
              selectedBotId === 'all'
                ? 'bg-brand-accent text-brand-bg border-brand-accent'
                : 'bg-brand-bg/40 text-brand-text border-brand-border hover:border-brand-accent/60'
            }`}
          >
            <span className="block text-sm font-bold">All Agents</span>
            <span className={`block text-xs mt-1 ${selectedBotId === 'all' ? 'text-brand-bg/80' : 'text-brand-muted'}`}>
              {getLeadCount('all')} leads
            </span>
          </button>

          {bots.map(bot => {
            const isSelected = selectedBotId === bot.id;
            return (
              <button
                key={bot.id}
                onClick={() => setSelectedBotId(bot.id)}
                className={`w-full text-left px-3 py-3 rounded-md border transition ${
                  isSelected
                    ? 'bg-brand-accent text-brand-bg border-brand-accent'
                    : 'bg-brand-bg/40 text-brand-text border-brand-border hover:border-brand-accent/60'
                }`}
              >
                <span className="block text-sm font-bold truncate">{bot.businessName}</span>
                <span className={`block text-xs mt-1 ${isSelected ? 'text-brand-bg/80' : 'text-brand-muted'}`}>
                  {getLeadCount(bot.id)} leads
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <LeadTable
        leads={leads}
        setLeads={setLeads}
        selectedBotId={selectedBotId}
        launchPublicChat={launchPublicChat}
        showToast={showToast}
      />
    </div>
  );
};
