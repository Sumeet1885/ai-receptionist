import React from 'react';
import { Icons } from '../../components/common/Icons';
import { PhoneCallRecord } from './dograhApi';

interface CallsTableProps {
  calls: PhoneCallRecord[];
  loading: boolean;
  onSync: () => void;
  syncing: boolean;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export const CallsTable: React.FC<CallsTableProps> = ({ calls, loading, onSync, syncing }) => {
  return (
    <section className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 sm:px-6 py-4 border-b border-brand-border flex items-center justify-between gap-3 bg-brand-bg/40">
        <div>
          <h3 className="font-display font-bold text-brand-text text-lg flex items-center gap-2">
            <Icons.Calendar /> Call History
          </h3>
          <p className="text-xs text-brand-muted mt-1">Inbound phone calls answered by the Dograh voice agent.</p>
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="text-xs font-mono text-brand-accent hover:text-brand-accent-hover flex items-center gap-1 disabled:opacity-50"
        >
          <Icons.Refresh /> {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      <div className="p-5 sm:p-6">
        {loading ? (
          <div className="py-14 text-center text-sm text-brand-muted animate-pulse">Loading calls…</div>
        ) : calls.length === 0 ? (
          <div className="py-14 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-brand-bg border border-brand-border text-brand-muted flex items-center justify-center"><Icons.Calendar /></div>
            <p className="text-sm font-semibold text-brand-text mt-4">No calls yet</p>
            <p className="text-xs text-brand-muted mt-1">Calls to the assigned number will appear here after they're answered.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {calls.map(call => (
              <article key={call.id} className="rounded-lg border border-brand-border bg-brand-bg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h5 className="text-sm font-bold text-brand-text truncate">{call.caller_number || 'Unknown caller'}</h5>
                    {call.lead && (
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border text-brand-accent border-brand-accent/30 bg-brand-accent/10">
                        {call.lead.lead_score}
                      </span>
                    )}
                    {call.ingest_status !== 'done' && (
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border text-brand-muted border-brand-border bg-brand-card">
                        {call.ingest_status}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-brand-muted mt-1">
                    {call.lead?.summary || 'No lead summary yet.'}
                  </p>
                </div>
                <div className="sm:text-right shrink-0 flex items-center gap-3">
                  <div>
                    <p className="text-sm font-semibold text-brand-text">{formatDuration(call.duration_seconds)}</p>
                    <p className="text-xs text-brand-muted mt-0.5">
                      {call.started_at ? new Date(call.started_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </p>
                  </div>
                  {call.recording_url && (
                    <a href={call.recording_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-brand-accent hover:text-brand-accent-hover">
                      Recording
                    </a>
                  )}
                  {call.transcript_url && (
                    <a href={call.transcript_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-brand-accent hover:text-brand-accent-hover">
                      Transcript
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
