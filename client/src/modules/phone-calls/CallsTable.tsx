import React, { useState, useEffect } from 'react';
import { Icons } from '../../components/common/Icons';
import { PhoneCallRecord } from './dograhApi';
import { WhatsAppButton } from '../../components/common/WhatsAppButton';

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
      (filterScore === 'cold'
        ? (!call.lead || call.lead.lead_score?.toLowerCase() === 'cold')
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
            {['all', 'hot', 'warm', 'cold'].map(score => (
              <button
                key={score}
                type="button"
                onClick={() => setFilterScore(score)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition border ${
                  filterScore === score
                    ? score === 'hot'
                      ? 'bg-rose-500 text-white border-rose-400 shadow-sm'
                      : score === 'warm'
                      ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                      : score === 'cold'
                      ? 'bg-cyan-500 text-black border-cyan-400 shadow-sm'
                      : 'bg-brand-accent text-brand-bg border-brand-accent shadow-sm'
                    : 'bg-brand-bg border-brand-border text-brand-muted hover:text-brand-text'
                }`}
              >
                {score === 'cold' ? '❄️ Cold' : score === 'hot' ? '🔥 Hot' : score === 'warm' ? '⚡ Warm' : 'All'}
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
          calls.length === 0 ? (
            /* First-time onboarding when zero calls exist */
            <div className="py-14 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-brand-bg border border-brand-border text-brand-accent flex items-center justify-center text-2xl shadow-inner">
                📡
              </div>
              <p className="text-sm font-bold text-brand-text mt-4">
                Your AI Telephony is Online & Ready
              </p>
              <p className="text-xs text-brand-muted mt-1 max-w-sm mx-auto">
                Incoming calls from customers and automated outbound dials will automatically appear here once completed.
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
            /* Sci-Fi Holographic Audio Radar Empty State */
            <div className="py-12 sm:py-16 text-center relative overflow-hidden flex flex-col items-center">
              {/* Background ambient radar glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-brand-accent/5 rounded-full blur-3xl pointer-events-none" />

              {/* Holographic Radar Disc Visualizer */}
              <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-full border border-brand-accent/25 bg-black/40 flex items-center justify-center shadow-[0_0_50px_rgba(25,233,157,0.12)]">
                {/* Crosshairs */}
                <div className="absolute inset-x-0 top-1/2 h-px bg-brand-accent/20" />
                <div className="absolute inset-y-0 left-1/2 w-px bg-brand-accent/20" />

                {/* Perimeter Azimuth Coordinate Ticks */}
                <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold text-brand-accent/40 select-none">000°</span>
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-mono font-bold text-brand-accent/40 select-none">090°</span>
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold text-brand-accent/40 select-none">180°</span>
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-mono font-bold text-brand-accent/40 select-none">270°</span>

                {/* Concentric Grid Rings */}
                <div className="absolute inset-6 rounded-full border border-brand-accent/20" />
                <div className="absolute inset-12 rounded-full border border-brand-accent/30" />
                <div className="absolute inset-20 rounded-full border border-brand-accent/40" />

                {/* Sonar Ripple Rings */}
                <div className="absolute w-28 h-28 rounded-full border border-brand-accent/50 animate-sonar-ripple pointer-events-none" />
                <div
                  className="absolute w-28 h-28 rounded-full border border-brand-accent/40 animate-sonar-ripple pointer-events-none"
                  style={{ animationDelay: '1.2s' }}
                />

                {/* Rotating Conic Radar Sweep Beam */}
                <div
                  className="absolute inset-0 rounded-full animate-radar-sweep pointer-events-none"
                  style={{
                    background: 'conic-gradient(from 0deg, transparent 0deg, transparent 270deg, rgba(25, 233, 157, 0.05) 320deg, rgba(25, 233, 157, 0.35) 360deg)',
                  }}
                />

                {/* ⚡ Ghost Signal Blip 1: Top-Right (Sector ~045°), Emerald Phosphor Ping */}
                <div
                  className="absolute top-[26%] right-[28%] z-10 pointer-events-none flex items-center justify-center animate-radar-blip-1 text-emerald-400"
                  title="Echo frequency detected"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white shadow-[0_0_8px_#10b981]" />
                  <span className="absolute w-5 h-5 rounded-full border border-emerald-400/60 animate-ping" />
                </div>

                {/* ⚡ Ghost Signal Blip 2: Bottom-Left (Sector ~210°), Cyan Echo Ping */}
                <div
                  className="absolute bottom-[28%] left-[24%] z-10 pointer-events-none flex items-center justify-center animate-radar-blip-2 text-cyan-400"
                  title="Echo frequency detected"
                >
                  <span className="w-2 h-2 rounded-full bg-cyan-400 border border-white shadow-[0_0_8px_#06b6d4]" />
                  <span className="absolute w-4 h-4 rounded-full border border-cyan-400/50 animate-ping" />
                </div>

                {/* ⚡ Ghost Signal Blip 3: Top-Left (Sector ~315°), Rose/Amber Distant Ping */}
                <div
                  className="absolute top-[32%] left-[30%] z-10 pointer-events-none flex items-center justify-center animate-radar-blip-3 text-rose-400"
                  title="Distant frequency echo"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 border border-white shadow-[0_0_6px_#f43f5e]" />
                  <span className="absolute w-3.5 h-3.5 rounded-full border border-rose-400/50 animate-ping" />
                </div>

                {/* Center Audio Hub Beacon */}
                <div className="relative z-10 w-12 h-12 rounded-full bg-brand-card/90 border border-brand-accent/60 flex items-center justify-center text-lg shadow-[0_0_20px_rgba(25,233,157,0.4)] backdrop-blur-md">
                  <span>📡</span>
                </div>
              </div>

              {/* Status Telemetry Pill */}
              <div className="mt-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-bg/90 border border-brand-accent/30 text-[11px] font-mono font-bold text-brand-accent shadow-sm">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span>RADAR SCAN COMPLETE: 0 AUDIO SIGNALS</span>
              </div>

              {/* Main Headline */}
              <h4 className="text-base sm:text-lg font-display font-extrabold text-brand-text mt-3 max-w-md px-4">
                {searchQuery ? (
                  <>
                    No calls found matching <span className="text-brand-accent">"{searchQuery}"</span>
                  </>
                ) : (
                  'No calls matching active filters'
                )}
              </h4>

              {/* Description */}
              <p className="text-xs text-brand-muted mt-1.5 max-w-md px-4 leading-relaxed">
                {searchQuery
                  ? `Frequency scan across all ${calls.length} recorded calls detected no incoming or outgoing audio logs for this contact.`
                  : `No calls matched your current stage (${filterScore.toUpperCase()}) or direction (${filterDirection}) filters.`}
              </p>

              {/* Interactive Actions */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 px-4">
                {searchQuery && onPlaceTestCall && /[\d+]{3,}/.test(searchQuery.trim()) && (
                  <button
                    type="button"
                    onClick={onPlaceTestCall}
                    className="h-9 px-4 rounded-xl bg-brand-accent hover:bg-brand-accent-hover text-brand-bg text-xs font-bold transition flex items-center gap-2 shadow-[0_0_20px_rgba(25,233,157,0.3)] hover:scale-105"
                  >
                    <span>⚡</span>
                    <span>Dial "{searchQuery}" Now</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterScore('all');
                    setFilterDirection('all');
                  }}
                  className="h-9 px-4 rounded-xl bg-brand-bg hover:bg-brand-card border border-brand-border hover:border-brand-accent text-xs font-bold text-brand-text transition flex items-center gap-2 shadow-sm"
                >
                  <span>↺</span>
                  <span>Reset Scanner & View All ({calls.length})</span>
                </button>
              </div>

              {/* Pro-Tip */}
              <p className="text-[11px] text-brand-muted/70 mt-4 max-w-sm px-4">
                💡 <span className="font-medium text-brand-muted">Search Tip:</span> Try searching by the last 4–5 digits, customer name, or clear your stage filters.
              </p>
            </div>
          )
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

                      {call.lead ? (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm ${
                            isLeadHot
                              ? 'text-rose-200 border-rose-500/70 bg-rose-500/25 animate-hot-blink shadow-rose-950/60 font-extrabold'
                              : isLeadWarm
                              ? 'text-amber-300 border-amber-500/40 bg-amber-500/15'
                              : 'text-cyan-300 border-cyan-400/40 bg-cyan-500/15'
                          }`}
                        >
                          {isLeadHot ? (
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                            </span>
                          ) : (
                            <span className={`w-1 h-1 rounded-full ${
                              isLeadWarm ? 'bg-amber-400' : 'bg-cyan-400'
                            }`} />
                          )}
                          <span>{isLeadHot ? '🔥 HOT LEAD' : `${call.lead.lead_score} Lead`}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border text-cyan-300/80 border-cyan-400/30 bg-cyan-500/10">
                          <span className="w-1 h-1 rounded-full bg-cyan-400" />
                          <span>❄️ COLD CALL</span>
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
                      {call.lead?.summary || (call.duration_seconds && call.duration_seconds > 0 ? 'Call completed without conversation / No response' : 'Missed or disconnected call')}
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
                      {call.caller_number && (
                        <WhatsAppButton
                          lead={{
                            name: call.lead?.name || 'Customer',
                            phone: call.caller_number,
                            appointmentStatus: call.lead?.appointment_status,
                            requirement: call.lead?.requirement,
                            budget: call.lead?.budget,
                          }}
                          size="sm"
                        />
                      )}
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
                  {selectedCall.lead?.lead_score ? (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                      selectedCall.lead.lead_score.toLowerCase() === 'hot'
                        ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
                        : selectedCall.lead.lead_score.toLowerCase() === 'warm'
                        ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                        : 'text-brand-accent border-brand-accent/30 bg-brand-accent/10'
                    }`}>
                      {selectedCall.lead.lead_score} Lead
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border text-cyan-300 border-cyan-400/30 bg-cyan-500/10">
                      Cold / Unanswered Call
                    </span>
                  )}
                </div>

                <p className="text-xs text-brand-muted leading-relaxed">
                  {selectedCall.lead?.summary || (selectedCall.duration_seconds && selectedCall.duration_seconds > 0 ? 'Customer did not reply or speak during the call.' : 'Missed or disconnected call.')}
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
            <div className="p-4 border-t border-brand-border bg-brand-bg/40 flex items-center justify-between gap-3">
              {selectedCall.caller_number ? (
                <WhatsAppButton
                  lead={{
                    name: selectedCall.lead?.name || 'Customer',
                    phone: selectedCall.caller_number,
                    appointmentStatus: selectedCall.lead?.appointment_status,
                    requirement: selectedCall.lead?.requirement,
                    budget: selectedCall.lead?.budget,
                  }}
                  size="md"
                />
              ) : (
                <div />
              )}
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
