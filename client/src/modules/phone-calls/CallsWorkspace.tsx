import React, { useCallback, useEffect, useState } from 'react';
import { Bot } from '../../types';
import { Icons } from '../../components/common/Icons';
import { PhoneAgentPanel } from './PhoneAgentPanel';
import { CallsTable } from './CallsTable';
import { dograhApi, PhoneCallRecord } from './dograhApi';

interface CallsWorkspaceProps {
  bots: Bot[];
  activeBotId: string | null;
  setActiveBotId: (id: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const CallsWorkspace: React.FC<CallsWorkspaceProps> = ({ bots, activeBotId, setActiveBotId, showToast }) => {
  const selectedBotId = activeBotId || bots[0]?.id || null;
  const [calls, setCalls] = useState<PhoneCallRecord[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [syncing, setSyncing] = useState(false);

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
    if (selectedBotId) void loadCalls(selectedBotId);
  }, [selectedBotId, loadCalls]);

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

  if (bots.length === 0) {
    return (
      <div className="bg-brand-card border border-brand-border rounded-lg p-10 text-center text-brand-muted">
        <p className="text-sm">Create an agent first so it can answer phone calls.</p>
      </div>
    );
  }

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
          {bots.map(bot => (
            <button
              key={bot.id}
              onClick={() => setActiveBotId(bot.id)}
              className={`w-full text-left px-3 py-3 rounded-md border transition ${
                selectedBotId === bot.id
                  ? 'bg-brand-accent text-brand-bg border-brand-accent'
                  : 'bg-brand-bg/40 text-brand-text border-brand-border hover:border-brand-accent/60'
              }`}
            >
              <span className="block text-sm font-bold truncate">{bot.businessName}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="space-y-4">
        {selectedBotId && <PhoneAgentPanel botId={selectedBotId} showToast={showToast} />}
        <CallsTable calls={calls} loading={loadingCalls} onSync={handleSync} syncing={syncing} />
      </div>
    </div>
  );
};
