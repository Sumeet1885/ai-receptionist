import React from 'react';
import { Lead } from '../../types';
import { Icons } from '../common/Icons';

interface LeadTableProps {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  activeBotId: string;
  launchPublicChat: (botId: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const LeadTable: React.FC<LeadTableProps> = ({ leads, setLeads, activeBotId, launchPublicChat, showToast }) => {
  const botLeads = leads.filter(l => l.botId === activeBotId);

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-brand-border flex flex-col sm:flex-row items-start sm:items-center justify-between bg-brand-bg/40 gap-3">
        <h3 className="font-display font-bold text-brand-text text-lg flex items-center">
          <Icons.Users />
          <span className="ml-2">Live CRM Prospect Sheet</span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 bg-brand-bg border border-brand-border text-brand-accent text-xs rounded-md font-mono">HubSpot Simulated Integration</span>
          <span className="px-2.5 py-1 bg-brand-bg border border-brand-border text-brand-accent text-xs rounded-md font-mono">Zapier Webhook Enabled</span>
        </div>
      </div>

      <div className="divide-y divide-brand-border">
        {botLeads.length === 0 ? (
          <div className="p-12 text-center text-brand-muted space-y-4">
            <Icons.Chat />
            <p className="text-sm font-sans">No prospective leads recorded yet for this AI agent.</p>
            <button
              onClick={() => launchPublicChat(activeBotId)}
              className="px-4 py-2 bg-brand-accent hover:bg-brand-accent-hover border border-brand-border text-brand-text font-sans font-semibold text-xs rounded-md transition"
            >
              Trigger Demo Conversations
            </button>
          </div>
        ) : (
          botLeads.map((lead) => (
            <div key={lead.id} className="p-6 hover:bg-brand-bg/20 transition flex flex-col md:flex-row justify-between gap-6">
              <div className="space-y-4 flex-1">
                {/* Lead header metadata */}
                <div className="flex flex-wrap items-center gap-3">
                  <h4 className="text-lg font-display font-bold text-brand-text">{lead.name}</h4>
                  <span className="text-xs text-brand-muted font-mono">📞 {lead.phone}</span>
                  <span className="text-xs text-brand-muted font-mono">{lead.date}</span>
                </div>

                {/* Requirement and Budget badges */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-brand-text bg-brand-bg border border-brand-border p-4 rounded-xl shadow-inner">
                  <div>
                    <span className="text-[10px] text-brand-muted block uppercase font-bold font-mono">Requirement & Interest:</span>
                    <span>{lead.requirement}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-brand-muted block uppercase font-bold font-mono">Budget Status:</span>
                    <span className="text-brand-accent font-semibold">{lead.budget}</span>
                  </div>
                </div>

                {/* Chat Transcript Summary */}
                <div className="space-y-1">
                  <span className="text-[10px] text-brand-accent font-bold uppercase tracking-wider block font-mono">AI Generated Chat Summary:</span>
                  <p className="text-sm text-brand-text leading-relaxed bg-brand-bg/30 border-l-2 border-brand-accent pl-3.5 py-2 rounded-r-md font-sans">
                    {lead.summary}
                  </p>
                </div>
              </div>

              {/* Lead status and quick score cards */}
              <div className="flex md:flex-col justify-between items-end gap-3 shrink-0">
                <div className="flex items-center space-x-2">
                  <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md border font-mono ${
                    lead.sentiment === 'Positive' ? 'bg-brand-success/10 border-brand-success/30 text-brand-success' :
                    lead.sentiment === 'Neutral' ? 'bg-brand-bg border-brand-border text-brand-muted' :
                    'bg-brand-danger/10 border-brand-danger/30 text-brand-danger'
                  }`}>
                    {lead.sentiment} Sentiment
                  </span>

                  <span className={`px-3 py-1 text-xs font-sans font-bold rounded-md border ${
                    lead.leadScore === 'HOT' ? 'bg-brand-danger text-brand-text border-brand-border animate-pulse' :
                    lead.leadScore === 'WARM' ? 'bg-brand-warning text-brand-bg border-brand-border font-bold' :
                    'bg-brand-bg text-brand-muted border-brand-border'
                  }`}>
                    {lead.leadScore} LEAD
                  </span>
                </div>

                {/* Appointment Schedule details */}
                <div className="text-right">
                  <span className="text-[10px] text-brand-muted font-bold uppercase tracking-wider block font-mono">Appointment Action:</span>
                  <span className="text-xs text-brand-text font-sans font-semibold flex items-center justify-end space-x-1.5 mt-1">
                    <Icons.Calendar />
                    <span>{lead.appointmentStatus}</span>
                  </span>
                </div>

                {/* Actions */}
                <button
                  onClick={() => {
                    setLeads(leads.filter(l => l.id !== lead.id));
                    showToast("Lead deleted from active CRM sheet");
                  }}
                  className="text-brand-muted hover:text-brand-danger p-1.5 rounded-md hover:bg-brand-bg transition border border-transparent hover:border-brand-border"
                  title="Delete Lead"
                >
                  <Icons.Trash />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
