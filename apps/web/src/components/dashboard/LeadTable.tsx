import React, { useState, useRef, useEffect } from 'react';
import { Lead } from '../../types';
import { Icons } from '../common/Icons';
import { supabase } from '../../lib/supabaseClient';
import { LEAD_SELECT_FIELDS } from '../../lib/leadQuery';
import { WhatsAppButton } from '../common/WhatsAppButton';
import { formatLeadDate } from '../../hooks/useLeads';

function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return 'Listen';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

interface LeadTableProps {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  selectedBotId: string | 'all';
  launchPublicChat: (botId: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const LeadTable: React.FC<LeadTableProps> = ({ leads, setLeads, selectedBotId, launchPublicChat, showToast }) => {
  const [filterChannel, setFilterChannel] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [filterScore, setFilterScore] = useState<'all' | 'HOT' | 'WARM'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [playingLeadId, setPlayingLeadId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleTogglePlay = (lead: Lead) => {
    if (!lead.recordingUrl) return;

    if (playingLeadId === lead.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingLeadId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(lead.recordingUrl);
    audioRef.current = audio;
    setPlayingLeadId(lead.id);

    audio.play().catch((err) => {
      console.error('Audio playback error:', err);
      showToast('Could not play audio recording', 'error');
      setPlayingLeadId(null);
    });

    audio.onended = () => {
      setPlayingLeadId(null);
    };

    audio.onerror = () => {
      showToast('Failed to load audio recording', 'error');
      setPlayingLeadId(null);
    };
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleDeleteLead = async (leadId: string) => {
    setDeletingId(leadId);
    setLeads(prev => prev.filter(l => l.id !== leadId));

    try {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadId);

      if (error) {
        console.error('Failed to delete lead from database:', error);
        showToast('Failed to delete lead: ' + error.message, 'error');
        // Restore from database
        const { data } = await supabase
          .from('leads')
          .select(LEAD_SELECT_FIELDS)
          .order('updated_at', { ascending: false });
        if (data) {
          setLeads(data.map((l: any) => ({
            id: l.id,
            botId: l.bot_id,
            name: l.name,
            phone: l.phone,
            email: l.email,
            requirement: l.requirement,
            budget: l.budget,
            sentiment: l.sentiment,
            leadScore: l.lead_score,
            summary: l.summary,
            appointmentStatus: l.appointment_status,
            date: formatLeadDate(l.updated_at)
          })));
        }
      } else {
        showToast('Lead permanently deleted', 'success');
      }
    } catch (err: any) {
      console.error('Error deleting lead:', err);
      showToast('Error deleting lead: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleScoreChange = async (leadId: string, newScore: 'HOT' | 'WARM') => {
    setUpdatingId(leadId);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, leadScore: newScore } : l));

    try {
      const { error } = await supabase
        .from('leads')
        .update({ lead_score: newScore })
        .eq('id', leadId);

      if (error) {
        showToast('Failed to update stage: ' + error.message, 'error');
      } else {
        showToast(`Lead moved to ${newScore === 'HOT' ? '🔥 Hot' : '⚡ Warm'}`, 'success');
      }
    } catch (err: any) {
      showToast('Error updating lead stage: ' + err.message, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSentimentChange = async (leadId: string, newSentiment: string) => {
    setUpdatingId(leadId);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, sentiment: newSentiment } : l));

    try {
      const { error } = await supabase
        .from('leads')
        .update({ sentiment: newSentiment })
        .eq('id', leadId);

      if (error) {
        showToast('Failed to update sentiment: ' + error.message, 'error');
      } else {
        showToast(`Sentiment updated to ${newSentiment}`, 'success');
      }
    } catch (err: any) {
      showToast('Error updating sentiment: ' + err.message, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // Exclude web chat tests and cold leads — Leads Queue is exclusively for qualified buyers (Hot & Warm)
  const botFilteredLeads = (selectedBotId === 'all' ? leads : leads.filter(l => l.botId === selectedBotId))
    .filter(l => l.channel !== 'web')
    .filter(l => l.leadScore !== 'COLD');

  const inboundCount = botFilteredLeads.filter(l => (l.channel || 'inbound') === 'inbound').length;
  const outboundCount = botFilteredLeads.filter(l => l.channel === 'outbound').length;

  const channelFilteredLeads = filterChannel === 'all'
    ? botFilteredLeads
    : botFilteredLeads.filter(l => (l.channel || 'inbound') === filterChannel);

  const visibleLeads = filterScore === 'all'
    ? channelFilteredLeads
    : channelFilteredLeads.filter(l => l.leadScore === filterScore);

  const hotCount = channelFilteredLeads.filter(l => l.leadScore === 'HOT').length;
  const warmCount = channelFilteredLeads.filter(l => l.leadScore === 'WARM').length;

  // Kanban Columns (Qualified stages only: Warm and Hot)
  const warmLeads = channelFilteredLeads.filter(l => l.leadScore === 'WARM');
  const hotLeads = channelFilteredLeads.filter(l => l.leadScore === 'HOT');

  const kanbanStages = [
    {
      id: 'WARM',
      title: '⚡ Warm Inquiries',
      subtitle: 'Interested / Requirements Shared',
      leads: warmLeads,
      accent: 'border-amber-500/40 text-amber-700 bg-amber-500/10',
      headerBg: 'bg-amber-50/20',
    },
    {
      id: 'HOT',
      title: '🔥 Hot (Visit Scheduled)',
      subtitle: 'Budget & Site Visit Agreed',
      leads: hotLeads,
      accent: 'border-rose-500/40 text-rose-700 bg-rose-500/10',
      headerBg: 'bg-rose-50/20',
    },
  ];

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-brand-border flex flex-col gap-3.5 bg-brand-bg/40">
        {/* Top Header Row: Title & View Mode Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="font-display font-bold text-brand-text text-lg flex items-center">
              <Icons.Users />
              <span className="ml-2">Lead Pipeline</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-body font-semibold bg-brand-bg border border-brand-border text-brand-muted">
              {visibleLeads.length} {visibleLeads.length === botFilteredLeads.length ? 'leads' : `of ${botFilteredLeads.length}`}
            </span>
          </div>

          {/* View Mode Toggle */}
          <div className="inline-flex items-center bg-brand-bg border border-brand-border rounded-lg p-1 text-xs shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`h-7 px-3 font-semibold rounded-md transition flex items-center gap-1.5 ${
                viewMode === 'list'
                  ? 'bg-brand-card text-brand-accent shadow-sm border border-brand-border font-bold'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <span>📋</span>
              <span>List View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`h-7 px-3 font-semibold rounded-md transition flex items-center gap-1.5 ${
                viewMode === 'kanban'
                  ? 'bg-brand-card text-brand-accent shadow-sm border border-brand-border font-bold'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <span>📊</span>
              <span>Kanban</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-brand-border/40">
          {/* Source / Channel Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-body uppercase font-bold text-brand-muted mr-1">Source:</span>
            <button
              type="button"
              onClick={() => setFilterChannel('all')}
              className={`h-7 px-2.5 rounded-lg text-xs font-bold transition border ${
 filterChannel === 'all'
 ? 'bg-brand-accent text-primary-foreground border-brand-accent shadow-sm'
 : 'bg-brand-bg border-brand-border text-brand-muted hover:text-brand-text'
 }`}
            >
              All Sources ({botFilteredLeads.length})
            </button>

            <button
              type="button"
              onClick={() => setFilterChannel('inbound')}
              className={`h-7 px-2.5 rounded-lg text-xs font-bold transition border flex items-center gap-1.5 ${
                filterChannel === 'inbound'
                  ? 'bg-emerald-500 text-black border-emerald-400 shadow-sm font-extrabold'
                  : 'bg-brand-bg border-emerald-500/30 text-emerald-700 hover:border-emerald-500/60'
              }`}
            >
              <span>📞 Inbound</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/25 font-body">{inboundCount}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterChannel('outbound')}
              className={`h-7 px-2.5 rounded-lg text-xs font-bold transition border flex items-center gap-1.5 ${
                filterChannel === 'outbound'
                  ? 'bg-indigo-500 text-white border-indigo-400 shadow-sm font-extrabold'
                  : 'bg-brand-bg border-indigo-500/30 text-indigo-700 hover:border-indigo-500/60'
              }`}
            >
              <span>🚀 Outbound Campaign</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/25 font-body">{outboundCount}</span>
            </button>
          </div>

          {/* Lead Score Stage Filter (Visible in List Mode) */}
          {viewMode === 'list' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-body uppercase font-bold text-brand-muted mr-1">Stage:</span>
              <button
                type="button"
                onClick={() => setFilterScore('all')}
                className={`h-7 px-2.5 rounded-lg text-xs font-bold transition border ${
                  filterScore === 'all'
                    ? 'bg-brand-text text-brand-bg border-brand-text shadow-sm'
                    : 'bg-brand-bg border-brand-border text-brand-muted hover:text-brand-text'
                }`}
              >
                All
              </button>

              <button
                type="button"
                onClick={() => setFilterScore('HOT')}
                className={`h-7 px-2.5 rounded-lg text-xs font-bold transition border flex items-center gap-1.5 ${
                  filterScore === 'HOT'
                    ? 'bg-rose-500 text-white border-rose-400 shadow-sm font-extrabold animate-pulse'
                    : 'bg-brand-bg border-rose-500/30 text-rose-700 hover:border-rose-500/60'
                }`}
              >
                <span>🔥 Hot</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/25 font-body">{hotCount}</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterScore('WARM')}
                className={`h-7 px-2.5 rounded-lg text-xs font-bold transition border flex items-center gap-1.5 ${
                  filterScore === 'WARM'
                    ? 'bg-amber-500 text-black border-amber-400 shadow-sm font-extrabold'
                    : 'bg-brand-bg border-amber-500/30 text-amber-700 hover:border-amber-500/60'
                }`}
              >
                <span>⚡ Warm</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/25 font-body">{warmCount}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KANBAN BOARD VIEW */}
      {viewMode === 'kanban' ? (
        <div className="p-6 overflow-x-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 min-w-[650px]">
            {kanbanStages.map((stage) => (
              <div
                key={stage.id}
                className="bg-brand-bg/50 border border-brand-border rounded-xl flex flex-col max-h-[750px] overflow-hidden shadow-inner"
              >
                {/* Column Header */}
                <div className={`p-4 border-b border-brand-border ${stage.headerBg} flex items-center justify-between`}>
                  <div>
                    <h4 className="font-display font-bold text-brand-text text-sm flex items-center gap-1.5">
                      <span>{stage.title}</span>
                    </h4>
                    <p className="text-[11px] text-brand-muted mt-0.5">{stage.subtitle}</p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-body font-bold border ${stage.accent}`}>
                    {stage.leads.length}
                  </span>
                </div>

                {/* Column Cards */}
                <div className="p-3 overflow-y-auto space-y-3 flex-1 divide-y-0">
                  {stage.leads.length === 0 ? (
                    <div className="py-12 text-center text-brand-muted text-xs">
                      No leads in this stage
                    </div>
                  ) : (
                    stage.leads.map((lead) => (
                      <div
                        key={lead.id}
                        className={`bg-brand-card border rounded-xl p-4 space-y-3 shadow-sm transition-all group card-hover-glow ${
                          lead.leadScore === 'HOT'
                            ? 'hot-card-glow border-rose-500/50'
                            : 'border-brand-border/80 hover:border-brand-accent/40'
                        }`}
                      >
                        {/* Card Top: Name & Quick Stage Dropdown */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h5 className="font-display font-bold text-brand-text text-sm leading-tight truncate">
                                {lead.name}
                              </h5>
                              {lead.channel === 'outbound' ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-700">
                                  <span>🚀 Outbound</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-700">
                                  <span>📞 Inbound</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] text-brand-muted font-body truncate">
                                📞 {lead.phone}
                              </span>
                              {lead.date && (
                                <span className="text-[10px] text-brand-muted/70 font-body truncate" title="Time lead was created/inquired">
                                  🕒 Inquired: {lead.date}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Quick Stage Move Dropdown */}
                          <select
                            value={lead.leadScore}
                            onChange={(e) => handleScoreChange(lead.id, e.target.value as any)}
                            disabled={updatingId === lead.id}
                            className="bg-brand-bg border border-brand-border rounded-md text-[11px] font-bold text-brand-text px-2 h-7 focus:outline-none focus:border-brand-accent cursor-pointer shrink-0 shadow-sm"
                            title="Move stage"
                          >
                            <option value="COLD">❄️ Cold</option>
                            <option value="WARM">⚡ Warm</option>
                            <option value="HOT">🔥 Hot</option>
                          </select>
                        </div>

                        {/* Sentiment & Budget & Sqft Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <select
                            value={lead.sentiment || (lead.summary === 'Customer did not reply' ? 'No Response' : 'Neutral')}
                            onChange={(e) => handleSentimentChange(lead.id, e.target.value)}
                            disabled={updatingId === lead.id}
                            className={`h-6 px-1.5 text-[10px] font-bold rounded-md border font-body transition-colors cursor-pointer focus:outline-none ${
                              lead.sentiment === 'Positive'
                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700'
                                : lead.sentiment === 'No Response' || lead.summary === 'Customer did not reply'
                                ? 'bg-zinc-100/80 border-zinc-200 text-zinc-700'
                                : lead.sentiment === 'Neutral'
                                ? 'bg-slate-100/70 border-slate-200 text-slate-700'
                                : lead.sentiment === 'Angry'
                                ? 'bg-rose-500/20 border-rose-500/40 text-rose-700'
                                : 'bg-amber-500/15 border-amber-500/40 text-amber-700'
                            }`}
                            title="Change Sentiment"
                          >
                            <option value="Positive" className="bg-brand-card text-emerald-700">😊 Positive</option>
                            <option value="Neutral" className="bg-brand-card text-slate-700">😐 Neutral</option>
                            <option value="No Response" className="bg-brand-card text-zinc-700">📵 No Response</option>
                            <option value="Urgent/Demanding" className="bg-brand-card text-amber-700">⚠️ Urgent</option>
                            <option value="Angry" className="bg-brand-card text-rose-700">😡 Angry</option>
                          </select>

                          {lead.budget && lead.budget !== 'N/A' && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-700 font-semibold font-body">
                              💰 {lead.budget}
                            </span>
                          )}
                          {lead.requirement && (
                            <span className="px-2 py-0.5 rounded bg-brand-bg border border-brand-border text-brand-text font-medium truncate max-w-[190px]">
                              📐 {lead.requirement}
                            </span>
                          )}
                        </div>

                        {/* Appointment Status Badge */}
                        {lead.appointmentStatus && lead.appointmentStatus !== 'None' && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-700 text-xs font-bold">
                            <Icons.Calendar />
                            <span>Site Visit: {lead.appointmentStatus}</span>
                          </div>
                        )}

                        {/* AI Summary Snippet */}
                        {lead.summary && (
                          <p className="text-xs text-brand-muted line-clamp-2 bg-brand-bg/40 p-2 rounded-md border border-brand-border/40 font-sans">
                            {lead.summary}
                          </p>
                        )}

                        {/* Card Bottom Actions */}
                        <div className="pt-2.5 border-t border-brand-border/60 flex items-center justify-between gap-2">
                          {lead.recordingUrl && (
                            <button
                              type="button"
                              onClick={() => handleTogglePlay(lead)}
                              className={`h-8 px-2.5 rounded-lg border text-xs font-semibold transition flex items-center gap-1.5 shadow-sm shrink-0 ${
                                playingLeadId === lead.id
                                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-700 font-bold'
                                  : 'bg-brand-bg/80 border-brand-border hover:border-brand-accent/50 text-brand-text hover:text-brand-accent'
                              }`}
                              title={playingLeadId === lead.id ? 'Pause audio' : 'Listen to call recording'}
                            >
                              {playingLeadId === lead.id ? (
                                <span className="flex items-end gap-0.5 h-3.5 px-0.5" aria-label="Playing audio">
                                  <span className="soundwave-bar" />
                                  <span className="soundwave-bar" />
                                  <span className="soundwave-bar" />
                                  <span className="soundwave-bar" />
                                </span>
                              ) : (
                                <span>▶</span>
                              )}
                              <span className="font-body text-[11px]">{formatDuration(lead.durationSeconds)}</span>
                            </button>
                          )}

                          <WhatsAppButton lead={lead} size="sm" className="flex-1 justify-center" />

                          <button
                            type="button"
                            onClick={() => handleDeleteLead(lead.id)}
                            disabled={deletingId === lead.id}
                            className="h-8 w-8 flex items-center justify-center rounded-lg border border-brand-border bg-brand-bg/60 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-700 text-brand-muted transition text-xs shrink-0 shadow-sm"
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
            ))}
          </div>
        </div>
      ) : (
        /* STANDARD LIST VIEW */
        <div className="divide-y divide-brand-border">
          {visibleLeads.length === 0 ? (
            <div className="p-12 text-center text-brand-muted space-y-2">
              <Icons.Chat />
              <p className="text-sm font-sans">
                {selectedBotId === 'all' ? 'No leads recorded yet.' : 'No leads recorded yet for this receptionist.'}
              </p>
              <p className="text-xs text-brand-muted/70">
                New leads will appear here automatically when callers speak with your AI receptionist or receive an outbound campaign call.
              </p>
            </div>
          ) : (
            visibleLeads.map((lead) => (
              <div
                key={lead.id}
                className={`p-5 sm:p-6 transition flex flex-col lg:flex-row justify-between gap-5 lg:items-center card-hover-glow ${
                  lead.leadScore === 'HOT'
                    ? 'bg-rose-500/[0.04] border-l-4 border-l-rose-500'
                    : 'hover:bg-brand-bg/30'
                }`}
              >
                <div className="space-y-3.5 flex-1 min-w-0">
                  {/* Lead header metadata */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h4 className="text-base sm:text-lg font-display font-bold text-brand-text">{lead.name}</h4>
                    {lead.channel === 'outbound' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-700 shadow-sm">
                        <span className="text-xs">🚀</span>
                        <span>Outbound Campaign</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 shadow-sm">
                        <span className="text-xs">📞</span>
                        <span>Inbound Call</span>
                      </span>
                    )}
                    <span className="text-xs text-brand-muted font-body px-2 py-0.5 rounded bg-brand-bg border border-brand-border flex items-center gap-1">
                      <span>📞</span>
                      <span>{lead.phone}</span>
                    </span>
                    {lead.email && (
                      <span className="text-xs text-brand-muted font-body px-2 py-0.5 rounded bg-brand-bg border border-brand-border flex items-center gap-1">
                        <span>✉️</span>
                        <span>{lead.email}</span>
                      </span>
                    )}
                    <span
                      className="text-xs font-body px-2.5 py-1 rounded-md bg-brand-bg/80 border border-brand-border/80 flex items-center gap-1.5 shadow-sm text-brand-muted hover:border-brand-accent/40 transition"
                      title="Exact timestamp when this inquiry occurred"
                    >
                      <span className="text-brand-accent text-xs">🕒</span>
                      <span className="text-[10px] uppercase font-bold text-brand-accent/90 tracking-wider">Inquired:</span>
                      <span className="text-brand-text font-semibold">{lead.date}</span>
                    </span>
                  </div>

                  {/* Requirement and Budget badges */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-brand-text bg-brand-bg/60 border border-brand-border p-3.5 rounded-xl shadow-inner">
                    <div>
                      <span className="text-[10px] text-brand-muted block uppercase font-bold font-body">Requirement & Interest:</span>
                      <span className="font-medium text-xs sm:text-sm">{lead.requirement || 'Not specified'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-muted block uppercase font-bold font-body">Budget Status:</span>
                      <span className="text-brand-accent font-semibold text-xs sm:text-sm font-body">{lead.budget || 'Not specified'}</span>
                    </div>
                  </div>

                  {/* Chat Transcript Summary */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-brand-accent font-bold uppercase tracking-wider block font-body">AI Generated Chat Summary:</span>
                    <p className="text-xs sm:text-sm text-brand-text leading-relaxed bg-brand-bg/30 border-l-2 border-brand-accent pl-3.5 py-2 rounded-r-md font-sans">
                      {lead.summary || 'Customer did not reply'}
                    </p>
                  </div>
                </div>

                {/* Lead status and actions column */}
                <div className="flex flex-row flex-wrap lg:flex-nowrap lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-3 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-brand-border/60">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Interactive Sentiment selector */}
                    <select
                      value={lead.sentiment || (lead.summary === 'Customer did not reply' ? 'No Response' : 'Neutral')}
                      onChange={(e) => handleSentimentChange(lead.id, e.target.value)}
                      disabled={updatingId === lead.id}
                      className={`h-7 px-2.5 text-[10px] font-bold rounded-full border font-body transition-colors cursor-pointer focus:outline-none ${
                        lead.sentiment === 'Positive'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700'
                          : lead.sentiment === 'No Response' || lead.summary === 'Customer did not reply'
                          ? 'bg-zinc-100/80 border-zinc-200 text-zinc-700'
                          : lead.sentiment === 'Neutral'
                          ? 'bg-slate-100/70 border-slate-200 text-slate-700'
                          : lead.sentiment === 'Angry'
                          ? 'bg-rose-500/20 border-rose-500/40 text-rose-700'
                          : 'bg-amber-500/15 border-amber-500/40 text-amber-700'
                      }`}
                      title="Click to change Sentiment"
                    >
                      <option value="Positive" className="bg-brand-card text-emerald-700">😊 Positive</option>
                      <option value="Neutral" className="bg-brand-card text-slate-700">😐 Neutral</option>
                      <option value="No Response" className="bg-brand-card text-zinc-700">📵 No Response</option>
                      <option value="Urgent/Demanding" className="bg-brand-card text-amber-700">⚠️ Urgent</option>
                      <option value="Angry" className="bg-brand-card text-rose-700">😡 Angry</option>
                    </select>

                    <span className={`inline-flex items-center gap-1.5 h-7 px-3 text-xs font-sans font-bold rounded-full border shadow-sm transition-all ${
                      lead.leadScore === 'HOT'
                        ? 'bg-rose-500/25 text-rose-800 border-rose-500/70 font-extrabold animate-pulse'
                        : lead.leadScore === 'WARM'
                        ? 'bg-amber-500/20 text-amber-700 border-amber-500/40'
                        : 'bg-cyan-500/20 text-cyan-700 border-cyan-400/40'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        lead.leadScore === 'HOT' ? 'bg-rose-400' : lead.leadScore === 'WARM' ? 'bg-amber-400' : 'bg-cyan-400'
                      }`} />
                      <span>
                        {lead.leadScore === 'HOT'
                          ? '🔥 HOT'
                          : lead.leadScore === 'WARM'
                          ? '⚡ WARM'
                          : '❄️ COLD'}
                      </span>
                    </span>
                  </div>

                  {/* Appointment Schedule details */}
                  {lead.appointmentStatus && lead.appointmentStatus !== 'None' ? (
                    <div className="lg:text-right">
                      <span className="text-[10px] text-brand-muted font-bold uppercase tracking-wider block font-body">Site Visit:</span>
                      <span className="text-xs font-sans font-bold inline-flex items-center gap-1.5 mt-0.5 px-2.5 py-1 rounded-md bg-brand-accent/15 text-brand-accent border border-brand-accent/30">
                        <Icons.Calendar />
                        <span>{lead.appointmentStatus}</span>
                      </span>
                    </div>
                  ) : null}

                  {/* Actions: Audio Recording + WhatsApp 1-Click + Delete */}
                  <div className="flex items-center gap-2 pt-1">
                    {lead.recordingUrl && (
                      <button
                        type="button"
                        onClick={() => handleTogglePlay(lead)}
                        className={`h-8 px-2.5 rounded-lg border text-xs font-semibold transition flex items-center gap-1.5 shadow-sm shrink-0 ${
                          playingLeadId === lead.id
                            ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-700 font-bold'
                            : 'bg-brand-bg border-brand-border hover:border-brand-accent/50 text-brand-text hover:text-brand-accent'
                        }`}
                        title={playingLeadId === lead.id ? 'Pause audio' : 'Listen to call recording'}
                      >
                        {playingLeadId === lead.id ? (
                          <span className="flex items-end gap-0.5 h-3.5 px-0.5" aria-label="Playing audio">
                            <span className="soundwave-bar" />
                            <span className="soundwave-bar" />
                            <span className="soundwave-bar" />
                            <span className="soundwave-bar" />
                          </span>
                        ) : (
                          <span>▶</span>
                        )}
                        <span className="font-body text-[11px]">{formatDuration(lead.durationSeconds)}</span>
                      </button>
                    )}
                    <WhatsAppButton lead={lead} size="sm" />
                    <button
                      type="button"
                      onClick={() => handleDeleteLead(lead.id)}
                      disabled={deletingId === lead.id}
                      className="h-8 w-8 flex items-center justify-center rounded-lg border border-brand-border bg-brand-bg hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-700 text-brand-muted transition text-xs shadow-sm"
                      title="Delete Lead"
                    >
                      <Icons.Trash />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
