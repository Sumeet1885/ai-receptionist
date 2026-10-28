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

function getInitials(name: string): string {
  if (!name) return 'L';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  activeBot,
  leads,
  navigate
}) => {
  const activeBotLeads = activeBot ? leads.filter(lead => lead.botId === activeBot.id) : leads;
  const voiceLeads = activeBotLeads.filter(lead => lead.channel !== 'web');
  const hotLeads = voiceLeads.filter(lead => lead.leadScore === 'HOT');
  const needsAttention = [...hotLeads, ...voiceLeads.filter(lead => lead.leadScore !== 'HOT')].slice(0, 6);

  return (
    <div className="space-y-6">
      {/* ── BROAD HERO BANNER: AUTONOMOUS AI RECEPTION & TELECALLING ── */}
      <div className="relative rounded-2xl overflow-hidden border border-brand-border shadow-sm group">
        {/* Background Image Container */}
        <div className="relative h-48 sm:h-60 lg:h-64 w-full overflow-hidden">
          <img
            src="/images/dashboard_banner.jpg"
            alt="Autonomous AI Voice Receptionist Station"
            className="w-full h-full object-cover object-center transform group-hover:scale-[1.02] transition-transform duration-700 ease-out"
          />
          {/* Subtle gradient vignette to keep text ultra-crisp while letting the image shine */}
          <div className="absolute inset-0 bg-gradient-to-r from-stone-950/80 via-stone-950/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/70 via-transparent to-transparent" />
        </div>

        {/* Foreground Content with Glassmorphic Badges */}
        <div className="absolute inset-0 p-5 sm:p-7 flex flex-col justify-between z-10">
          {/* Top Row: System Health Badge & Quick Telephony Line */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-stone-900/75 backdrop-blur-md border border-white/15 text-white text-xs font-semibold shadow-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Autonomous AI Telecaller & Receptionist Active</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-400/30 text-emerald-300 text-xs font-bold shadow-md">
              <span>📞 Line: {activeBot?.phoneNumber || '+91 22 6423 0099'}</span>
            </div>
          </div>

          {/* Bottom Row: Title, Subtitle & Action Launchers */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="max-w-xl text-white">
              <h2 className="font-display font-extrabold text-xl sm:text-2xl lg:text-3xl tracking-tight drop-shadow-sm">
                {activeBot?.businessName || 'Bolega Autonomous Voice Reception'}
              </h2>
              <p className="text-xs sm:text-sm text-stone-200/90 mt-1 line-clamp-2 font-sans font-medium drop-shadow-sm">
                Answering incoming inquiries 24/7, qualifying high-intent buyers, and booking site visits directly to your calendar.
              </p>
            </div>

            {/* Quick-Fire Launchpad Buttons */}
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => navigate('/inbound-calls')}
                className="h-9 px-4 rounded-xl bg-white/90 hover:bg-white text-stone-900 font-bold text-xs transition backdrop-blur-md flex items-center gap-1.5 shadow-md hover:shadow-lg cursor-pointer"
              >
                <span>📞</span>
                <span>Test Inbound</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/outbound-calls')}
                className="h-9 px-4 rounded-xl bg-brand-accent hover:bg-brand-accent-hover text-primary-foreground font-bold text-xs transition flex items-center gap-1.5 shadow-md hover:shadow-lg cursor-pointer"
              >
                <span>🚀</span>
                <span>Launch Telecaller</span>
              </button>
            </div>
          </div>
        </div>
      </div>


      {/* ── FULL-WIDTH NEEDS ATTENTION PIPELINE SECTION ── */}
      <section className="bg-brand-card border border-brand-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border bg-brand-bg/40 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-lg text-brand-text flex items-center gap-2">
              <Icons.Users />
              <span>Needs Attention</span>
            </h3>
            <p className="text-xs text-brand-muted mt-0.5">
              High-priority callers and recent qualified inquiries ready for follow-up.
            </p>
          </div>
          <button
            onClick={() => navigate('/leads')}
            className="px-3.5 py-2 bg-brand-accent text-primary-foreground hover:bg-brand-accent-hover hover:text-primary-foreground rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1.5"
          >
            <span>View Full Pipeline</span>
            <span>→</span>
          </button>
        </div>

        <div className="divide-y divide-brand-border">
          {needsAttention.length === 0 ? (
            <div className="p-12 text-center text-brand-muted space-y-2">
              <div className="w-10 h-10 mx-auto rounded-full bg-brand-bg border border-brand-border flex items-center justify-center text-lg">
                👥
              </div>
              <p className="text-sm font-semibold text-brand-text">All leads are currently up to date!</p>
              <p className="text-xs text-brand-muted max-w-sm mx-auto">
                Incoming calls and voice inquiries answered by your AI receptionist will appear here automatically.
              </p>
            </div>
          ) : (
            needsAttention.map((lead) => (
              <div
                key={lead.id}
                className={`p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:bg-brand-bg/40 ${lead.leadScore === 'HOT' ? 'bg-rose-500/[0.03] border-l-4 border-l-rose-500' : ''
                  }`}
              >
                {/* Caller Info & Requirement */}
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-xs shrink-0 shadow-sm border ${lead.leadScore === 'HOT'
                        ? 'bg-rose-500/20 text-rose-700 border-rose-500/30'
                        : 'bg-brand-bg text-brand-text border-brand-border'
                      }`}
                  >
                    {getInitials(lead.name)}
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-display font-bold text-brand-text text-base truncate">
                        {lead.name}
                      </h4>

                      {lead.channel === 'outbound' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-700">
                          <span>🚀 Outbound</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-700">
                          <span>📞 Inbound</span>
                        </span>
                      )}

                      <span
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${lead.leadScore === 'HOT'
                            ? 'bg-rose-500/20 border-rose-500/50 text-rose-700 animate-pulse'
                            : 'bg-amber-500/20 border-amber-500/50 text-amber-700'
                          }`}
                      >
                        {lead.leadScore === 'HOT' ? '🔥 HOT' : '⚡ WARM'}
                      </span>

                      {lead.appointmentStatus && lead.appointmentStatus !== 'None' && lead.appointmentStatus !== 'Not Scheduled' && (
                        <span className="px-2 py-0.5 rounded-md bg-brand-accent/15 border border-brand-accent/30 text-brand-accent text-[10px] font-bold flex items-center gap-1">
                          <span>📅</span>
                          <span>{lead.appointmentStatus}</span>
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-brand-muted font-sans line-clamp-2 leading-relaxed">
                      {lead.summary === 'Customer did not reply'
                        ? 'Caller connected — requirement details logged from voice conversation.'
                        : lead.summary || lead.requirement || 'Requirement logged from voice conversation.'}
                    </p>
                  </div>
                </div>

                {/* Right Action: Phone & Open */}
                <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                  <span className="text-xs text-brand-muted font-body font-semibold px-2.5 py-1 rounded bg-brand-bg border border-brand-border flex items-center gap-1">
                    <span>📞</span>
                    <span>{lead.phone}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => navigate('/leads')}
                    className="px-3.5 py-1.5 bg-brand-bg hover:bg-brand-card hover:border-brand-accent border border-brand-border rounded-lg text-xs font-bold text-brand-text transition flex items-center gap-1 shadow-sm"
                  >
                    <span>Open Lead</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
