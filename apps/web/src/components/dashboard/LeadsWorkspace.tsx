import React from 'react';
import { Bot, Lead } from '../../types';
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
  return (
    <div className="w-full">
      <LeadTable
        leads={leads}
        setLeads={setLeads}
        selectedBotId={selectedBotId}
        setSelectedBotId={setSelectedBotId}
        bots={bots}
        launchPublicChat={launchPublicChat}
        showToast={showToast}
      />
    </div>
  );
};
