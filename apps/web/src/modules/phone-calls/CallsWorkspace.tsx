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

export type WorkspaceTab = 'incoming' | 'outgoing' | 'logs';
export type OutgoingSubTab = 'single' | 'bulk';

interface CallsWorkspaceProps {
  bots: Bot[];
  activeBotId: string | null;
  setActiveBotId: (id: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  initialTab?: WorkspaceTab;
  hideSubTabs?: boolean;
}

export const CallsWorkspace: React.FC<CallsWorkspaceProps> = ({
  bots,
  activeBotId,
  setActiveBotId,
  showToast,
  initialTab,
  hideSubTabs,
}) => {
  const selectedBot = bots.find(b => b.id === activeBotId) || bots[0] || null;
  const selectedBotId = selectedBot?.id || null;

  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab || 'incoming');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
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
        <h3 className="text-base font-bold text-brand-text">Telephony Lines</h3>
        <p className="text-xs text-brand-muted mt-1.5">
          Your AI receptionist lines and personas are managed directly via Dograh. Active lines will automatically appear here.
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
      {/* ── TOP HERO ROW: RECEPTIONIST SELECTOR ── */}
      <div className="w-full">
        <AgentSelectorDropdown
          bots={bots}
          selectedBotId={selectedBotId}
          onSelectBot={setActiveBotId}
          agentStatus={agentStatus}
        />
      </div>

      {/* ── WORKSPACE SESSIONS NAVIGATION (SEPARATE SESSIONS) ── */}
      {!hideSubTabs && (
        <div ref={sessionsNavRef} className="grid grid-cols-1 md:grid-cols-3 gap-3 scroll-mt-6">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`p-3.5 rounded-2xl text-left border transition-all duration-200 flex flex-col justify-between gap-2.5 ${isActive
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
      )}

      {/* ── SEPARATE SESSION 1: INCOMING CALLS (CUSTOMERS CALL YOU) ── */}
      {selectedBotId && activeTab === 'incoming' && (
        <div className="space-y-6">
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
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${outgoingSubTab === 'single'
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
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${outgoingSubTab === 'bulk'
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
