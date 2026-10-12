import React, { useState, useEffect } from 'react';
import { Icons } from '../../components/common/Icons';
import { PhoneCallRecord } from './dograhApi';

interface CallsTableProps {
  calls: PhoneCallRecord[];
  loading: boolean;
  onSync: () => void;
  syncing: boolean;
  onPlaceTestCall?: () => void;
  initialFilterDirection?: 'all' | 'inbound' | 'outbound';
  initialFilterScore?: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export const CallsTable: React.FC<CallsTableProps> = ({
  calls,
  loading,
  onSync,
  syncing,
  onPlaceTestCall,
  initialFilterDirection,
  initialFilterScore,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterScore, setFilterScore] = useState<string>(initialFilterScore || 'all');
  const [filterDirection, setFilterDirection] = useState<'all' | 'inbound' | 'outbound'>(initialFilterDirection || 'all');
  const [selectedCall, setSelectedCall] = useState<PhoneCallRecord | null>(null);

  useEffect(() => {
    if (initialFilterDirection !== undefined) {
      setFilterDirection(initialFilterDirection);
    }
  }, [initialFilterDirection]);

  useEffect(() => {
    if (initialFilterScore !== undefined) {
      setFilterScore(initialFilterScore);
    }
  }, [initialFilterScore]);

  const inboundCount = calls.filter(c => c.direction !== 'outbound').length;
  const outboundCount = calls.filter(c => c.direction === 'outbound').length;

  const filteredCalls = calls.filter(call => {
    const isOutbound = call.direction === 'outbound';
    const matchesDirection =
      filterDirection === 'all' ||
      (filterDirection === 'outbound' ? isOutbound : !isOutbound);

    const matchesSearch =
      !searchQuery ||
      (call.caller_number && call.caller_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (call.lead?.name && call.lead.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (call.lead?.summary && call.lead.summary.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesScore =
      filterScore === 'all' ||
      (filterScore === 'qualified'
        ? Boolean(call.lead && ['hot', 'warm'].includes(call.lead.lead_score?.toLowerCase() || ''))
        : Boolean(call.lead && call.lead.lead_score?.toLowerCase() === filterScore.toLowerCase()));

    return matchesDirection && matchesSearch && matchesScore;
  });

  return (
    <section className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden shadow-sm space-y-0">
      <div className="px-5 sm:px-6 py-4 border-b border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-brand-bg/40">
        <div>
          <h3 className="font-display font-extrabold text-brand-text text-base lg:text-lg flex items-center gap-2">
            <span>Call History & Transcripts</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-brand-bg border border-brand-border text-brand-muted">
              {calls.length} total
            </span>
          </h3>
          <p className="text-xs text-brand-muted mt-0.5">
            Complete log of incoming calls answered by your AI and outgoing calls placed to customers.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="h-9 px-3.5 rounded-xl bg-brand-bg hover:bg-brand-card border border-brand-border text-xs font-bold text-brand-accent hover:text-brand-accent-hover transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Icons.Refresh /> {syncing ? 'Syncing runs…' : 'Sync now'}
          </button>
        </div>
      </div>

      {/* Direction & Search Filter Bar */}
      <div className="p-4 border-b border-brand-border bg-brand-bg/30 space-y-3">
        {/* Call Direction Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-brand-text mr-1">Call Type:</span>
          <button
            type="button"
            onClick={() => setFilterDirection('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
              filterDirection === 'all'
                ? 'bg-brand-accent text-brand-bg border-brand-accent shadow-sm'
                : 'bg-brand-card text-brand-muted hover:text-brand-text border-brand-border'
            }`}
          >
            <span>All Calls</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20">{calls.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterDirection('inbound')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
              filterDirection === 'inbound'
                ? 'bg-emerald-500 text-black border-emerald-400 shadow-sm'
                : 'bg-brand-card text-brand-muted hover:text-emerald-400 border-brand-border'
            }`}
          >
            <span>📥 Incoming (Customers Called You)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20">{inboundCount}</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterDirection('outbound')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
              filterDirection === 'outbound'
                ? 'bg-sky-500 text-black border-sky-400 shadow-sm'
                : 'bg-brand-card text-brand-muted hover:text-sky-400 border-brand-border'
            }`}
          >
            <span>📤 Outgoing (AI Called Customers)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20">{outboundCount}</span>
          </button>
        </div>

        {/* Search & Lead Score Row */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pt-1">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by phone number, customer name, or keyword…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-3 pr-8 rounded-lg bg-brand-bg border border-brand-border text-xs text-brand-text placeholder-brand-muted focus:border-brand-accent outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-xs text-brand-muted hover:text-brand-text"
              >
                ×
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1 sm:pb-0">
            <span className="text-brand-muted text-[11px] mr-1 hidden sm:inline">Lead score:</span>
            {['all', 'qualified', 'hot', 'warm', 'cold'].map(score => (
              <button
                key={score}
                type="button"
                onClick={() => setFilterScore(score)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition border ${
                  filterScore === score
                    ? 'bg-brand-accent text-brand-bg border-brand-accent'
                    : 'bg-brand-bg border-brand-border text-brand-muted hover:text-brand-text'
                }`}
              >
                {score === 'qualified' ? '🔥 Qualified' : score}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {loading ? (
          <div className="py-14 text-center text-sm text-brand-muted animate-pulse">
            Loading phone call records…
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="py-14 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-brand-bg border border-brand-border text-brand-muted flex items-center justify-center text-xl">
              📞
            </div>
            <p className="text-sm font-bold text-brand-text mt-4">
              {searchQuery || filterDirection !== 'all' ? 'No matching phone calls found' : 'No calls recorded yet'}
            </p>
            <p className="text-xs text-brand-muted mt-1 max-w-sm mx-auto">
              {filterDirection === 'inbound'
                ? 'Incoming calls from customers dialing your number will appear here.'
                : filterDirection === 'outbound'
                ? 'Test dials and outbound campaign calls placed by your AI will appear here.'
                : 'Both incoming and outgoing phone calls will automatically appear here once completed.'}
            </p>
            {onPlaceTestCall && (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={onPlaceTestCall}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black text-xs font-bold transition inline-flex items-center gap-2 shadow-sm"
                >
                  <span>📱</span> Place Your First Test Call
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCalls.map(call => {
              const isLeadHot = call.lead?.lead_score?.toLowerCase() === 'hot';
              const isLeadWarm = call.lead?.lead_score?.toLowerCase() === 'warm';
              const isOutbound = call.direction === 'outbound';

              return (
                <article
                  key={call.id}
                  className="rounded-xl border border-brand-border bg-brand-bg hover:border-brand-accent/40 p-4 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {/* Direction Badge */}
                      {isOutbound ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center gap-1">
                          <span>📤</span> Outgoing Call (AI Called Customer)
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                          <span>📥</span> Incoming Call (Customer Called You)
                        </span>
                      )}

                      <span className="text-sm font-bold font-mono text-brand-text">
                        {call.caller_number || 'Unknown'}
                      </span>

                      {call.lead?.name && (
                        <span className="text-xs text-brand-muted font-medium">
                          ({call.lead.name})
                        </span>
                      )}

                      {call.lead && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                            isLeadHot
                              ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
                              : isLeadWarm
                              ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                              : 'text-brand-accent border-brand-accent/30 bg-brand-accent/10'
                          }`}
                        >
                          {call.lead.lead_score} Lead
                        </span>
                      )}

                      {call.lead?.appointment_status && call.lead.appointment_status !== 'none' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                          Booked: {call.lead.appointment_status}
                        </span>
                      )}

                      {call.ingest_status !== 'done' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border text-brand-muted border-brand-border bg-brand-card">
                          {call.ingest_status}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-brand-muted line-clamp-2">
                      {call.lead?.summary || 'No lead summary generated yet.'}
                    </p>
                  </div>

                  <div className="md:text-right shrink-0 flex items-center gap-4 pt-2 md:pt-0 border-t md:border-t-0 border-brand-border/60">
                    <div>
                      <p className="text-sm font-bold font-mono text-brand-text">
                        {formatDuration(call.duration_seconds)}
                      </p>
                      <p className="text-[11px] text-brand-muted mt-0.5">
                        {call.started_at
                          ? new Date(call.started_at).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCall(call);
                        }}
                        className="h-8 px-3 rounded-lg bg-brand-card hover:bg-brand-accent/20 hover:text-brand-accent border border-brand-border text-xs font-bold text-brand-text transition flex items-center gap-1.5 shadow-sm"
                        title="View details and listen to recording"
                      >
                        <span>▶</span> {call.recording_url ? 'Listen & Details' : 'Details'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* ── IN-APP AUDIO PLAYER & CALL DETAILS MODAL ── */}
      {selectedCall && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-brand-card border border-brand-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-brand-border flex items-center justify-between gap-4 bg-brand-bg/60">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    selectedCall.direction === 'outbound'
                      ? 'bg-sky-500/15 border-sky-500/30 text-sky-400'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  }`}>
                    {selectedCall.direction === 'outbound' ? '📤 Outgoing Call' : '📥 Incoming Call'}
                  </span>
                  <span className="text-sm font-mono font-bold text-brand-text">
                    {selectedCall.caller_number || 'Unknown'}
                  </span>
                </div>
                {selectedCall.lead?.name && (
                  <p className="text-xs text-brand-muted font-medium">
                    Caller Name: <strong className="text-brand-text">{selectedCall.lead.name}</strong>
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedCall(null)}
                className="w-8 h-8 rounded-lg bg-brand-bg hover:bg-brand-card text-brand-muted hover:text-brand-text border border-brand-border flex items-center justify-center text-sm transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 lg:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Audio Player Card */}
              {selectedCall.recording_url ? (
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-brand-bg to-brand-bg border border-emerald-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-brand-text flex items-center gap-1.5">
                      <span>🎧</span> Call Recording Playback
                    </span>
                    <span className="text-xs font-mono font-bold text-brand-accent">
                      {formatDuration(selectedCall.duration_seconds)}
                    </span>
                  </div>
                  <audio
                    controls
                    src={selectedCall.recording_url}
                    className="w-full h-10 rounded-lg accent-emerald-400"
                  />
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-brand-bg/60 border border-brand-border text-center text-xs text-brand-muted">
                  No audio recording file available for this run.
                </div>
              )}

              {/* Lead Qualification Summary */}
              <div className="p-4 rounded-xl bg-brand-bg/60 border border-brand-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-text">AI Lead Qualification</span>
                  {selectedCall.lead?.lead_score && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                      selectedCall.lead.lead_score.toLowerCase() === 'hot'
                        ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
                        : selectedCall.lead.lead_score.toLowerCase() === 'warm'
                        ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                        : 'text-brand-accent border-brand-accent/30 bg-brand-accent/10'
                    }`}>
                      {selectedCall.lead.lead_score} Lead
                    </span>
                  )}
                </div>

                <p className="text-xs text-brand-muted leading-relaxed">
                  {selectedCall.lead?.summary || 'No conversation summary recorded.'}
                </p>

                {selectedCall.lead?.appointment_status && selectedCall.lead.appointment_status !== 'none' && (
                  <div className="pt-2 border-t border-brand-border/60 flex items-center justify-between text-xs">
                    <span className="text-brand-muted">Appointment:</span>
                    <span className="font-bold text-emerald-400">Booked ({selectedCall.lead.appointment_status})</span>
                  </div>
                )}
              </div>

              {/* Call Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-brand-bg border border-brand-border space-y-1">
                  <span className="text-[10px] text-brand-muted uppercase tracking-wider block">Started At</span>
                  <span className="font-medium text-brand-text block">
                    {selectedCall.started_at ? new Date(selectedCall.started_at).toLocaleString() : '—'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-brand-bg border border-brand-border space-y-1">
                  <span className="text-[10px] text-brand-muted uppercase tracking-wider block">Call Duration</span>
                  <span className="font-mono font-bold text-brand-text block">
                    {formatDuration(selectedCall.duration_seconds)}
                  </span>
                </div>
              </div>

              {/* Transcript External Link if present */}
              {selectedCall.transcript_url && (
                <div className="flex justify-end">
                  <a
                    href={selectedCall.transcript_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand-accent hover:underline flex items-center gap-1 font-bold"
                  >
                    <span>📄</span> View Raw JSON Transcript File ↗
                  </a>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-brand-border bg-brand-bg/40 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCall(null)}
                className="h-9 px-5 rounded-xl bg-brand-card hover:bg-brand-bg text-brand-text border border-brand-border text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
