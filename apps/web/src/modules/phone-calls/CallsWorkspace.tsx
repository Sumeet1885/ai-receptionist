import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Bot } from '../../types';
import { Icons } from '../../components/common/Icons';
import { PhoneAgentPanel } from './PhoneAgentPanel';
import { OutboundDialerPanel } from './OutboundDialerPanel';
import { BulkCallPanel } from './BulkCallPanel';
import { CallsTable } from './CallsTable';
import { OutboundLineSetupCard } from './OutboundLineSetupCard';
import { CallsQuickStartGuide } from './CallsQuickStartGuide';
import { AgentSelectorDropdown } from './AgentSelectorDropdown';
import { dograhApi, PhoneAgentStatus, PhoneCallRecord, DograhNumber } from './dograhApi';

interface CallsWorkspaceProps {
  bots: Bot[];
  activeBotId: string | null;
  setActiveBotId: (id: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

type WorkspaceTab = 'incoming' | 'outgoing' | 'logs';
type OutgoingSubTab = 'single' | 'bulk';

export const CallsWorkspace: React.FC<CallsWorkspaceProps> = ({
  bots,
  activeBotId,
  setActiveBotId,
  showToast,
}) => {
  const selectedBot = bots.find(b => b.id === activeBotId) || bots[0] || null;
  const selectedBotId = selectedBot?.id || null;

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('incoming');
  const [outgoingSubTab, setOutgoingSubTab] = useState<OutgoingSubTab>('single');
  const [calls, setCalls] = useState<PhoneCallRecord[]>([]);
  const [numbers, setNumbers] = useState<DograhNumber[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isAgentProvisioned, setIsAgentProvisioned] = useState(false);
  const [agentStatus, setAgentStatus] = useState<PhoneAgentStatus | null>(null);
  const [logFilterDirection, setLogFilterDirection] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [logFilterScore, setLogFilterScore] = useState<string>('all');

  const sessionsNavRef = useRef<HTMLDivElement>(null);

  const scrollToSessions = useCallback(() => {
    setTimeout(() => {
      sessionsNavRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }, []);

  const loadStatus = useCallback(async (botId: string) => {
    try {
      const status = await dograhApi.getStatus(botId);
      setAgentStatus(status);
      setIsAgentProvisioned(Boolean(status.outboundProvisioned && (status.outboundPhoneNumber || status.phoneNumber)));
    } catch {
      setAgentStatus(null);
    }
  }, []);

  const loadNumbers = useCallback(async (botId: string) => {
    try {
      const data = await dograhApi.listNumbers(botId);
      setNumbers(data.numbers);
    } catch {
      setNumbers([]);
    }
  }, []);

  const loadCalls = useCallback(async (botId: string) => {
    setLoadingCalls(true);
    try {
      const data = await dograhApi.listCalls(botId);
      setCalls(data.calls);
    } catch (err: any) {
      showToast(err.message || 'Could not load call history', 'error');
    } finally {
      setLoadingCalls(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (selectedBotId) {
      void loadStatus(selectedBotId);
      void loadNumbers(selectedBotId);
      void loadCalls(selectedBotId);
    }
  }, [selectedBotId, loadStatus, loadNumbers, loadCalls]);

  const handleSync = async () => {
    if (!selectedBotId) return;
    setSyncing(true);
    try {
      const result = await dograhApi.syncNow(selectedBotId);
      showToast(`Synced ${result.ingested} new call(s).`, 'success');
      await loadCalls(selectedBotId);
    } catch (err: any) {
      showToast(err.message || 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Directional KPI calculations
  const totalCallsCount = calls.length;
  const inboundCallsCount = calls.filter(c => c.direction !== 'outbound').length;
  const outboundCallsCount = calls.filter(c => c.direction === 'outbound').length;
  const totalSeconds = calls.reduce((acc, c) => acc + (c.duration_seconds || 0), 0);
  const avgSeconds = totalCallsCount > 0 ? Math.round(totalSeconds / totalCallsCount) : 0;
  const avgMinutes = Math.floor(avgSeconds / 60);
  const avgRemainingSecs = avgSeconds % 60;
  const formattedAvgDuration = totalCallsCount > 0 ? `${avgMinutes}m ${avgRemainingSecs}s` : '—';
  const hotLeadsCount = calls.filter(c => c.lead && c.lead.lead_score?.toLowerCase() === 'hot').length;

  if (bots.length === 0) {
    return (
      <div className="bg-brand-card border border-brand-border rounded-2xl p-12 text-center text-brand-muted max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-full bg-brand-bg border border-brand-border text-brand-muted flex items-center justify-center mx-auto mb-4 text-xl">
          🤖
        </div>
        <h3 className="text-base font-bold text-brand-text">No Agents Available</h3>
        <p className="text-xs text-brand-muted mt-1.5">
          Create an agent first before configuring phone numbers and telephony integrations.
        </p>
      </div>
    );
  }

  const tabs = [
    {
      id: 'incoming' as WorkspaceTab,
      label: '📥 Incoming Calls (Customers Call You)',
      sublabel: 'How callers reach your AI receptionist',
      badge: agentStatus?.phoneNumber ? agentStatus.telephony?.provider?.toUpperCase() || 'ACTIVE' : 'SETUP REQUIRED',
      badgeColor: agentStatus?.phoneNumber ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' : 'bg-amber-500/15 text-amber-700 border-amber-500/30',
    },
    {
      id: 'outgoing' as WorkspaceTab,
      label: '📤 Outgoing Calls (AI Calls Customers)',
      sublabel: 'Test call your phone or bulk campaign',
      badge: outboundCallsCount > 0 ? `${outboundCallsCount} Calls` : null,
      badgeColor: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
    },
    {
      id: 'logs' as WorkspaceTab,
      label: '📜 Call History & Recordings',
      sublabel: 'Review transcripts, recordings & lead scores',
      badge: totalCallsCount > 0 ? `${totalCallsCount} Total` : null,
      badgeColor: 'bg-brand-accent/15 text-brand-accent border-brand-accent/30',
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── TOP HERO ROW: RECEPTIONIST SELECTOR & CLEAR KPI STATS ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-4 items-stretch">
        {/* Agent Switcher Card (Linear / Vercel Style with Floating Dropdown & Search) */}
        <AgentSelectorDropdown
          bots={bots}
          selectedBotId={selectedBotId}
          onSelectBot={setActiveBotId}
          agentStatus={agentStatus}
        />

        {/* Hero KPIs Bar: Clarified Incoming vs Outgoing & Leads (Fully Clickable & Linked) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Card 1: Phone Numbers (Inbound & Outbound) -> Click to View Line Setup */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('incoming');
              scrollToSessions();
            }}
            className={`bg-brand-card border rounded-2xl p-4 shadow-sm flex flex-col justify-between text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-md group cursor-pointer ${
              activeTab === 'incoming'
                ? 'border-emerald-500/60 ring-1 ring-emerald-500/40 bg-emerald-500/[0.04]'
                : 'border-brand-border hover:border-emerald-500/40'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted block group-hover:text-emerald-700 transition-colors">
                Phone Lines
              </span>
              <span className="text-[10px] font-bold text-brand-muted group-hover:text-emerald-700 flex items-center gap-1 transition-colors">
                Setup →
              </span>
            </div>
            <div className="my-2 space-y-1">
              <div>
                <span className="text-[10px] text-brand-muted block">📥 Inbound Line:</span>
                <span className="text-sm font-body font-extrabold text-brand-text truncate block group-hover:text-emerald-700 transition-colors">
                  {agentStatus?.phoneNumber || 'No Number Yet'}
                </span>
              </div>
              {agentStatus?.outboundPhoneNumber && agentStatus.outboundPhoneNumber !== agentStatus.phoneNumber && (
                <div>
                  <span className="text-[10px] text-sky-700 block">📤 Outbound Caller ID:</span>
                  <span className="text-xs font-body font-bold text-sky-700 truncate block">
                    {agentStatus.outboundPhoneNumber}
                  </span>
                </div>
              )}
              {agentStatus?.connectedLines && agentStatus.connectedLines.some(l => l.type === 'forwarding') && (
                <div>
                  <span className="text-[10px] text-cyan-700 block">🔄 Forwarding Mobile SIM:</span>
                  <span className="text-xs font-body font-bold text-cyan-700 truncate block">
                    {agentStatus.connectedLines.find(l => l.type === 'forwarding')?.phoneNumber}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-brand-muted truncate group-hover:text-brand-text transition-colors">
                {agentStatus?.telephony?.provider ? `Via ${agentStatus.telephony.provider.toUpperCase()}` : 'Default Platform Ready'}
              </span>
              {agentStatus?.connectedLines && agentStatus.connectedLines.length > 1 && (
                <span className="px-1.5 py-0.2 rounded font-bold bg-emerald-500/15 text-emerald-700 border border-emerald-500/25 shrink-0">
                  {agentStatus.connectedLines.length} Lines
                </span>
              )}
            </div>
          </button>

          {/* Card 2: 📥 Incoming Calls -> Click to View Inbound Call Logs */}
          <button
            type="button"
            onClick={() => {
              setLogFilterDirection('inbound');
              setLogFilterScore('all');
              setActiveTab('logs');
              scrollToSessions();
            }}
            className={`bg-brand-card border rounded-2xl p-4 shadow-sm flex flex-col justify-between text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-md group cursor-pointer ${
              activeTab === 'logs' && logFilterDirection === 'inbound'
                ? 'border-emerald-500/60 ring-1 ring-emerald-500/40 bg-emerald-500/[0.04]'
                : 'border-brand-border hover:border-emerald-500/40'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                📥 Incoming Calls
              </span>
              <span className="text-[10px] font-bold text-brand-muted group-hover:text-emerald-700 flex items-center gap-1 transition-colors">
                View →
              </span>
            </div>
            <div className="my-2 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold text-brand-text group-hover:text-emerald-700 transition-colors">
                {inboundCallsCount}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 font-bold">
                Inbound
              </span>
            </div>
            <span className="text-[10px] text-brand-muted block group-hover:text-brand-text transition-colors">
              Customers who called you →
            </span>
          </button>

          {/* Card 3: 📤 Outgoing Calls -> Click to View Outbound Call Logs */}
          <button
            type="button"
            onClick={() => {
              setLogFilterDirection('outbound');
              setLogFilterScore('all');
              setActiveTab('logs');
              scrollToSessions();
            }}
            className={`bg-brand-card border rounded-2xl p-4 shadow-sm flex flex-col justify-between text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-md group cursor-pointer ${
              activeTab === 'logs' && logFilterDirection === 'outbound'
                ? 'border-sky-500/60 ring-1 ring-sky-500/40 bg-sky-500/[0.04]'
                : 'border-brand-border hover:border-sky-500/40'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700 flex items-center gap-1.5">
                📤 Outgoing Calls
              </span>
              <span className="text-[10px] font-bold text-brand-muted group-hover:text-sky-700 flex items-center gap-1 transition-colors">
                View →
              </span>
            </div>
            <div className="my-2 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold text-brand-text group-hover:text-sky-700 transition-colors">
                {outboundCallsCount}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 border border-sky-500/20 font-bold">
                Outbound
              </span>
            </div>
            <span className="text-[10px] text-brand-muted block group-hover:text-brand-text transition-colors">
              AI called customers / test dials →
            </span>
          </button>

          {/* Card 4: Hot Leads -> Click to View Hot Leads */}
          <button
            type="button"
            onClick={() => {
              setLogFilterDirection('all');
              setLogFilterScore('hot');
              setActiveTab('logs');
              scrollToSessions();
            }}
            className={`bg-brand-card border rounded-2xl p-4 shadow-sm flex flex-col justify-between text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-md group cursor-pointer ${
              activeTab === 'logs' && logFilterScore === 'hot'
                ? 'border-brand-accent/60 ring-1 ring-brand-accent/40 bg-brand-accent/[0.04]'
                : 'border-brand-border hover:border-brand-accent/40'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted group-hover:text-brand-accent transition-colors flex items-center gap-1.5">
                🔥 Hot Leads
              </span>
              <span className="text-[10px] font-bold text-brand-muted group-hover:text-brand-accent flex items-center gap-1 transition-colors">
                Filter →
              </span>
            </div>
            <div className="my-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-brand-accent block">
                {hotLeadsCount}
              </span>
              <span className="text-xs text-brand-muted">
                / {totalCallsCount}
              </span>
            </div>
            <span className="text-[10px] text-brand-muted block group-hover:text-brand-text transition-colors">
              High-intent callers identified →
            </span>
          </button>
        </div>
      </div>

      {/* ── INTERACTIVE 3-STEP QUICK START GUIDE ── */}
      {selectedBotId && (
        <CallsQuickStartGuide
          isProvisioned={Boolean(agentStatus?.provisioned)}
          hasInboundNumber={Boolean(agentStatus?.phoneNumber)}
          hasPlacedCall={calls.some(c => c.direction === 'outbound')}
          phoneNumber={agentStatus?.phoneNumber || null}
          onProvision={async () => {
            try {
              await dograhApi.provision(selectedBotId);
              showToast('AI Voice Engine provisioned successfully!', 'success');
              void loadStatus(selectedBotId);
            } catch (err: any) {
              showToast(err.message || 'Dograh voice server is unreachable. Check if the EC2 instance is running.', 'error');
            }
          }}
          onNavigateTab={tab => {
            setActiveTab(tab);
            scrollToSessions();
          }}
          onNavigateOutgoingSubTab={subTab => {
            setActiveTab('outgoing');
            setOutgoingSubTab(subTab);
            scrollToSessions();
          }}
        />
      )}

      {/* ── WORKSPACE SESSIONS NAVIGATION (SEPARATE SESSIONS) ── */}
      <div ref={sessionsNavRef} className="grid grid-cols-1 md:grid-cols-3 gap-3 scroll-mt-6">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`p-3.5 rounded-2xl text-left border transition-all duration-200 flex flex-col justify-between gap-2.5 ${
                isActive
                  ? 'bg-brand-card border-brand-accent shadow-md ring-1 ring-brand-accent/50'
                  : 'bg-brand-card/60 hover:bg-brand-card border-brand-border hover:border-brand-border/80'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className={`text-sm font-bold truncate ${isActive ? 'text-brand-text' : 'text-brand-muted'}`}>
                  {tab.label}
                </span>
                {tab.badge && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border shrink-0 ${tab.badgeColor}`}>
                    {tab.badge}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-brand-muted line-clamp-1">
                {tab.sublabel}
              </p>
            </button>
          );
        })}
      </div>

      {/* ── SEPARATE SESSION 1: INCOMING CALLS (CUSTOMERS CALL YOU) ── */}
      {selectedBotId && activeTab === 'incoming' && (
        <div className="space-y-6">
          {/* Session Explainer Banner */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-brand-card to-brand-card border border-emerald-500/30 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 flex items-center justify-center text-xl shrink-0">
                  📥
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-display font-extrabold text-brand-text">
                      Incoming Calls: When Customers Call Your Business
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-700 border border-emerald-500/30">
                      Customer Inbound Line
                    </span>
                  </div>
                  <p className="text-xs text-brand-muted mt-1 max-w-3xl">
                    This is your customer-facing phone line. When callers dial this number, your AI receptionist answers immediately, answers questions using your business details, and takes customer bookings 24/7.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto flex-wrap">
                {agentStatus?.phoneNumber && (
                  <div className="px-4 py-2 rounded-xl bg-brand-bg/80 border border-brand-border">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">Your Inbound Number</span>
                    <span className="text-sm font-body font-extrabold text-emerald-700">{agentStatus.phoneNumber}</span>
                  </div>
                )}
                <div className="px-4 py-2 rounded-xl bg-brand-bg/80 border border-brand-border">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">Calendar Booking Status</span>
                  {agentStatus?.calendarConnected ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Live Calendar Booking Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700" title="Calendar setup not done. AI Agent notes visit day/time and informs caller sales team will follow up.">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      Sales Callback Mode (No Calendar)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <PhoneAgentPanel
            botId={selectedBotId}
            showToast={showToast}
            onProvisionedChange={ready => {
              setIsAgentProvisioned(ready);
              void loadStatus(selectedBotId);
            }}
          />
        </div>
      )}

      {/* ── SEPARATE SESSION 2: OUTGOING CALLS (AI CALLS CUSTOMERS) ── */}
      {selectedBotId && activeTab === 'outgoing' && (
        <div className="space-y-6">
          {/* Session Explainer Banner */}
          <div className="bg-gradient-to-r from-sky-500/10 via-brand-card to-brand-card border border-sky-500/30 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-700 flex items-center justify-center text-xl shrink-0">
                  📤
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-display font-extrabold text-brand-text">
                      Outgoing Calls: When Your AI Calls Customers
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-700 border border-sky-500/30">
                      Outbound Voice
                    </span>
                  </div>
                  <p className="text-xs text-brand-muted mt-1 max-w-3xl">
                    Use this session whenever you want your AI receptionist to dial out. You can call your own mobile phone right now to test how the AI speaks, or upload an Excel contact list to run automated outbound calling campaigns.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Outbound Caller ID Setup Card */}
          <OutboundLineSetupCard
            botId={selectedBotId}
            status={agentStatus}
            numbers={numbers}
            showToast={showToast}
            onUpdated={() => {
              void loadStatus(selectedBotId);
              void loadNumbers(selectedBotId);
            }}
          />

          {/* Sub-Session Switcher: Test Single Call vs Bulk Campaign */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1.5 rounded-2xl bg-brand-card border border-brand-border">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOutgoingSubTab('single')}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  outgoingSubTab === 'single'
                    ? 'bg-sky-500 text-black shadow-sm font-extrabold'
                    : 'text-brand-muted hover:text-brand-text hover:bg-brand-bg'
                }`}
              >
                <span>📞</span>
                <span>Live Test Call (Call My Mobile Phone)</span>
              </button>
              <button
                type="button"
                onClick={() => setOutgoingSubTab('bulk')}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  outgoingSubTab === 'bulk'
                    ? 'bg-sky-500 text-black shadow-sm font-extrabold'
                    : 'text-brand-muted hover:text-brand-text hover:bg-brand-bg'
                }`}
              >
                <span>🚀</span>
                <span>Automated Campaign (Call Contact List)</span>
              </button>
            </div>
            <span className="text-[11px] text-brand-muted px-3">
              {outgoingSubTab === 'single' ? 'Dial 1 number instantly' : 'Bulk dial leads from Excel/CSV'}
            </span>
          </div>

          {/* Sub-session 1: Single Number Live Test Call */}
          {outgoingSubTab === 'single' && (
            <OutboundDialerPanel
              botId={selectedBotId}
              callerId={agentStatus?.outboundPhoneNumber || agentStatus?.phoneNumber || null}
              isProvisioned={Boolean(agentStatus?.provisioned)}
              showToast={showToast}
              onCallPlaced={() => void loadCalls(selectedBotId)}
            />
          )}

          {/* Sub-session 2: Bulk Phone Campaign */}
          {outgoingSubTab === 'bulk' && (
            <BulkCallPanel
              botId={selectedBotId}
              isProvisioned={Boolean(agentStatus?.outboundProvisioned && (agentStatus?.outboundPhoneNumber || agentStatus?.phoneNumber))}
              showToast={showToast}
            />
          )}
        </div>
      )}

      {/* ── SEPARATE SESSION 3: CALL LOGS & RECORDINGS ── */}
      {selectedBotId && activeTab === 'logs' && (
        <div className="space-y-6">
          <CallsTable
            calls={calls}
            loading={loadingCalls}
            onSync={handleSync}
            syncing={syncing}
            initialFilterDirection={logFilterDirection}
            initialFilterScore={logFilterScore}
            onPlaceTestCall={() => {
              setActiveTab('outgoing');
              setOutgoingSubTab('single');
              scrollToSessions();
            }}
          />
        </div>
      )}
    </div>
  );
};
