import React from 'react';
import { Bot, Lead } from '../../types';
import { Icons } from '../common/Icons';

interface DashboardHomeProps {
  activeBot: Bot | null;
  bots: Bot[];
  leads: Lead[];
  navigate: (path: string) => void;
  launchPublicChat: (botId: string) => void;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  activeBot,
  bots,
  leads,
  navigate,
  launchPublicChat
}) => {
  const activeBotLeads = activeBot ? leads.filter(lead => lead.botId === activeBot.id) : leads;
  const hotLeads = activeBotLeads.filter(lead => lead.leadScore === 'HOT');
  const bookedLeads = activeBotLeads.filter(lead => lead.appointmentStatus && lead.appointmentStatus !== 'None');
  const needsAttention = [...hotLeads, ...activeBotLeads.filter(lead => lead.leadScore !== 'HOT')].slice(0, 4);

  const overviewCards = [
    {
      label: 'New Leads',
      value: activeBotLeads.length,
      detail: 'Captured by your receptionist',
      tone: 'text-brand-text'
    },
    {
      label: 'Needs Follow-Up',
      value: hotLeads.length,
      detail: 'High intent conversations',
      tone: 'text-brand-danger'
    },
    {
      label: 'Appointments',
      value: bookedLeads.length,
      detail: 'Bookings mentioned in leads',
      tone: 'text-brand-success'
    },
    {
      label: 'Active Agents',
      value: bots.length,
      detail: activeBot ? activeBot.businessName : 'Create your first agent',
      tone: 'text-brand-accent'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {overviewCards.map(card => (
          <div key={card.label} className="bg-brand-card border border-brand-border rounded-lg p-5 shadow-sm">
            <p className="text-xs font-mono font-bold uppercase tracking-wider text-brand-muted">{card.label}</p>
            <div className="flex items-end gap-2 mt-3">
              <span className={`text-4xl font-display font-extrabold ${card.tone}`}>{card.value}</span>
            </div>
            <p className="text-xs text-brand-muted mt-2 font-sans truncate">{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        <section className="bg-brand-card border border-brand-border rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-brand-border flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-lg text-brand-text">Needs Attention</h3>
              <p className="text-xs text-brand-muted mt-1">Start here when you open the app each day.</p>
            </div>
            <button
              onClick={() => navigate('/leads')}
              className="px-3 py-2 bg-brand-bg hover:bg-brand-border border border-brand-border rounded-md text-xs font-semibold text-brand-text transition"
            >
              View all leads
            </button>
          </div>
          <div className="divide-y divide-brand-border">
            {needsAttention.length === 0 ? (
              <div className="p-10 text-center text-brand-muted">
                <Icons.Users />
                <p className="text-sm mt-3">No leads need attention right now.</p>
              </div>
            ) : (
              needsAttention.map(lead => (
                <div key={lead.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-brand-bg/30 transition">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-display font-bold text-brand-text">{lead.name}</h4>
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                        lead.leadScore === 'HOT'
                          ? 'bg-brand-danger/15 border-brand-danger/30 text-brand-danger'
                          : 'bg-brand-bg border-brand-border text-brand-muted'
                      }`}>
                        {lead.leadScore}
                      </span>
                    </div>
                    <p className="text-sm text-brand-muted mt-1 line-clamp-2">{lead.summary || lead.requirement}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-brand-muted font-mono">{lead.phone}</span>
                    <button
                      onClick={() => navigate('/leads')}
                      className="px-3 py-2 bg-brand-accent hover:bg-brand-accent-hover rounded-md text-xs font-bold text-brand-text transition"
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="bg-brand-card border border-brand-border rounded-lg p-5 shadow-sm">
            <h3 className="font-display font-bold text-lg text-brand-text">Receptionist Status</h3>
            {activeBot ? (
              <div className="space-y-4 mt-4">
                <div>
                  <p className="text-xs font-mono uppercase tracking-wider text-brand-muted">Active Agent</p>
                  <p className="font-semibold text-brand-text mt-1">{activeBot.businessName}</p>
                </div>
                <div>
                  <p className="text-xs font-mono uppercase tracking-wider text-brand-muted">Public Link</p>
                  <p className="text-xs text-brand-accent mt-1 break-all">/chats/{activeBot.subDomain}</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => navigate(`/agents/${activeBot.id}/install`)}
                    className="flex-1 px-3 py-2 bg-brand-bg hover:bg-brand-border border border-brand-border rounded-md text-xs font-semibold text-brand-text transition"
                  >
                    Install
                  </button>
                  <button
                    onClick={() => launchPublicChat(activeBot.id)}
                    className="flex-1 px-3 py-2 bg-brand-accent hover:bg-brand-accent-hover rounded-md text-xs font-bold text-brand-text transition"
                  >
                    Preview
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-brand-muted">
                <p>No receptionist agent exists yet.</p>
                <button
                  onClick={() => navigate('/agents/new')}
                  className="mt-4 px-4 py-2 bg-brand-accent hover:bg-brand-accent-hover rounded-md text-xs font-bold text-brand-text transition"
                >
                  Create agent
                </button>
              </div>
            )}
          </div>

          <div className="bg-brand-card border border-brand-border rounded-lg p-5 shadow-sm">
            <h3 className="font-display font-bold text-lg text-brand-text">Quick Actions</h3>
            <div className="grid gap-2 mt-4">
              <button onClick={() => navigate('/inbox')} className="text-left px-3 py-3 bg-brand-bg hover:bg-brand-border border border-brand-border rounded-md text-sm text-brand-text transition">
                Review conversations
              </button>
              <button onClick={() => navigate('/calendar')} className="text-left px-3 py-3 bg-brand-bg hover:bg-brand-border border border-brand-border rounded-md text-sm text-brand-text transition">
                Check calendar setup
              </button>
              <button onClick={() => navigate('/agents')} className="text-left px-3 py-3 bg-brand-bg hover:bg-brand-border border border-brand-border rounded-md text-sm text-brand-text transition">
                Manage agents
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
