import React, { useState, useRef, useEffect } from 'react';
import { Lead, Bot } from '../../types';
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

function getInitials(name: string): string {
  if (!name) return 'L';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface LeadTableProps {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  selectedBotId: string | 'all';
  setSelectedBotId?: (id: string | 'all') => void;
  bots?: Bot[];
  launchPublicChat: (botId: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  targetLeadId?: string;
  appointmentsCount?: number;
}

export const LeadTable: React.FC<LeadTableProps> = ({
  leads,
  setLeads,
  selectedBotId,
  setSelectedBotId,
  bots = [],
  showToast,
  targetLeadId,
  appointmentsCount,
}) => {
  const [filterChannel, setFilterChannel] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [filterScore, setFilterScore] = useState<'all' | 'HOT' | 'WARM'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [playingLeadId, setPlayingLeadId] = useState<string | null>(null);
  const [highlightedLeadId, setHighlightedLeadId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pipelineRef = useRef<HTMLDivElement | null>(null);
  const scrolledTargetRef = useRef<string | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterChannel, filterScore, searchQuery, selectedBotId]);

  const activeTargetId = targetLeadId || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('leadId') : null);

  useEffect(() => {
    if (!activeTargetId || leads.length === 0) return;
    if (scrolledTargetRef.current === activeTargetId) return;

    setHighlightedLeadId(activeTargetId);
    setViewMode('list');
    setFilterScore('all');
    setFilterChannel('all');
    setSearchQuery('');
    if (setSelectedBotId) {
      setSelectedBotId('all');
    }

    const qualified = leads
      .filter(l => l.channel !== 'web')
      .filter(l => l.appointmentStatus !== 'ARCHIVED')
      .filter(l => l.leadScore !== 'COLD');

    const targetIdx = qualified.findIndex(l => l.id === activeTargetId);
    const targetPage = targetIdx >= 0 ? Math.floor(targetIdx / pageSize) + 1 : 1;
    setCurrentPage(targetPage);

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const el = document.getElementById('lead-row-' + activeTargetId);
      if (el) {
        clearInterval(interval);
        scrolledTargetRef.current = activeTargetId;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof window !== 'undefined' && window.location.search.includes('leadId=')) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      } else if (attempts >= 25) {
        clearInterval(interval);
      }
    }, 80);

    return () => clearInterval(interval);
  }, [activeTargetId, leads, pageSize, setSelectedBotId]);

  const handleCardFilter = (score: 'all' | 'HOT' | 'WARM') => {
    if (filterScore === score && score !== 'all') {
      setFilterScore('all');
    } else {
      setFilterScore(score);
      if (viewMode !== 'list') {
        setViewMode('list');
      }
    }
    setTimeout(() => {
      pipelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => showToast(`${label} copied to clipboard!`, 'success'),
      () => showToast(`Failed to copy ${label.toLowerCase()}`, 'error')
    );
  };

  const handleCopyLeadSummary = (lead: Lead) => {
    const formatted = [
      `👤 Lead: ${lead.name}`,
      `📞 Phone: ${lead.phone}`,
      lead.email ? `✉️ Email: ${lead.email}` : null,
      `📅 Call Time: ${lead.date}`,
      `🎯 Stage: ${lead.leadScore === 'HOT' ? '🔥 HOT' : '⚡ WARM'}`,
      `📋 Requirement: ${lead.requirement || 'Not specified'}`,
      `💰 Budget: ${lead.budget || 'Not specified'}`,
      lead.appointmentStatus && lead.appointmentStatus !== 'None' ? `📅 Site Visit: ${lead.appointmentStatus}` : null,
      lead.summary ? `✨ Summary: ${lead.summary}` : null,
    ].filter(Boolean).join('\n');

    copyToClipboard(formatted, 'Lead details');
  };

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
    if (!window.confirm('Archive this lead? It will be safely removed from your active pipeline.')) {
      return;
    }
    setDeletingId(leadId);
    setLeads(prev => prev.filter(l => l.id !== leadId));

    try {
      // Soft-delete: mark appointment_status as ARCHIVED to retain call logs, audio & transcripts
      const { error } = await supabase
        .from('leads')
        .update({ appointment_status: 'ARCHIVED' })
        .eq('id', leadId);

      if (error) {
        console.error('Failed to archive lead:', error);
        showToast('Failed to archive lead: ' + error.message, 'error');
        // Restore from database
        const { data } = await supabase
          .from('leads')
          .select(LEAD_SELECT_FIELDS)
          .neq('appointment_status', 'ARCHIVED')
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
            date: formatLeadDate(l.updated_at),
          })));
        }
      } else {
        showToast('Lead archived (soft-deleted).', 'success');
      }
    } catch (err: any) {
      showToast('Error archiving lead: ' + err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleScoreChange = async (leadId: string, newScore: 'HOT' | 'WARM' | 'COLD') => {
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
        const badge = newScore === 'HOT' ? '🔥 Hot' : newScore === 'WARM' ? '⚡ Warm' : '❄️ Cold';
        showToast(`Lead moved to ${badge}`, 'success');
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

  // Exclude web chat tests and cold leads by default — Leads Pipeline is for qualified voice inquiries
  const botFilteredLeads = (selectedBotId === 'all' ? leads : leads.filter(l => l.botId === selectedBotId))
    .filter(l => l.channel !== 'web')
    .filter(l => l.leadScore !== 'COLD');

  // KPI Calculations
  const totalQualified = botFilteredLeads.length;
  const totalHot = botFilteredLeads.filter(l => l.leadScore === 'HOT').length;
  const totalWarm = botFilteredLeads.filter(l => l.leadScore === 'WARM').length;
  const totalInbound = botFilteredLeads.filter(l => (l.channel || 'inbound') === 'inbound').length;
  const totalOutbound = botFilteredLeads.filter(l => l.channel === 'outbound').length;
  const totalSiteVisits = appointmentsCount !== undefined
    ? appointmentsCount
    : botFilteredLeads.filter(
    l => l.appointmentStatus && l.appointmentStatus !== 'None' && l.appointmentStatus !== 'Not Scheduled'
  ).length;
  const positiveSentimentCount = botFilteredLeads.filter(l => l.sentiment === 'Positive').length;
  const positivePercent = totalQualified > 0 ? Math.round((positiveSentimentCount / totalQualified) * 100) : 0;

  const channelFilteredLeads = filterChannel === 'all'
    ? botFilteredLeads
    : botFilteredLeads.filter(l => (l.channel || 'inbound') === filterChannel);

  // Search Filtering
  const searchedLeads = channelFilteredLeads.filter(l => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (l.name || '').toLowerCase().includes(q) ||
      (l.phone || '').toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (l.requirement || '').toLowerCase().includes(q) ||
      (l.budget || '').toLowerCase().includes(q) ||
      (l.summary || '').toLowerCase().includes(q)
    );
  });

  const visibleLeads = filterScore === 'all'
    ? searchedLeads
    : searchedLeads.filter(l => l.leadScore === filterScore);

  const totalPages = Math.max(1, Math.ceil(visibleLeads.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedLeads = visibleLeads.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);

  const hotCount = channelFilteredLeads.filter(l => l.leadScore === 'HOT').length;
  const warmCount = channelFilteredLeads.filter(l => l.leadScore === 'WARM').length;

  // Kanban Columns
  const kanbanWarmLeads = searchedLeads.filter(l => l.leadScore === 'WARM');
  const kanbanHotLeads = searchedLeads.filter(l => l.leadScore === 'HOT');

  const kanbanStages = [
    {
      id: 'WARM',
      title: '⚡ Warm Prospects',
      subtitle: 'Interested · Budget & Requirements Logged',
      leads: kanbanWarmLeads,
      accent: 'border-amber-500/40 text-amber-700 bg-amber-500/10',
      headerBg: 'bg-amber-50/50',
    },
    {
      id: 'HOT',
      title: '🔥 Hot (Visit Scheduled)',
      subtitle: 'High Intent · Site Visit / Callback Confirmed',
      leads: kanbanHotLeads,
      accent: 'border-rose-500/40 text-rose-700 bg-rose-500/10',
      headerBg: 'bg-rose-50/50',
    },
  ];

  // CSV Export handler
  const handleExportCSV = () => {
    if (visibleLeads.length === 0) {
      showToast('No leads to export', 'error');
      return;
    }

    const headers = [
      'Name',
      'Phone',
      'Email',
      'Source Channel',
      'Lead Stage',
      'Sentiment',
      'Client Requirement',
      'Budget Status',
      'Call Date & Time',
      'Site Visit / Appointment',
      'AI Call Summary'
    ];

    const rows = visibleLeads.map(l => [
      `"${(l.name || '').replace(/"/g, '""')}"`,
      `"${(l.phone || '').replace(/"/g, '""')}"`,
      `"${(l.email || '').replace(/"/g, '""')}"`,
      `"${l.channel === 'outbound' ? 'Outbound Campaign' : 'Inbound Call'}"`,
      `"${l.leadScore || 'WARM'}"`,
      `"${l.sentiment || 'Neutral'}"`,
      `"${(l.requirement || '').replace(/"/g, '""')}"`,
      `"${(l.budget || '').replace(/"/g, '""')}"`,
      `"${(l.date || '').replace(/"/g, '""')}"`,
      `"${(l.appointmentStatus || '').replace(/"/g, '""')}"`,
      `"${(l.summary || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `leads_pipeline_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${visibleLeads.length} leads to CSV`, 'success');
  };

  return (
    <div className="space-y-5">
      {/* 1. TOP KPI METRICS SUMMARY BAR (Clickable to Filter) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Metric 1: Total Qualified (Click to show all) */}
        <button
          type="button"
          onClick={() => handleCardFilter('all')}
          className={`text-left rounded-xl p-4 shadow-sm transition-all cursor-pointer border ${
            filterScore === 'all'
              ? 'bg-brand-card border-brand-accent/60 ring-2 ring-brand-accent/30 shadow-md'
              : 'bg-brand-card border-brand-border hover:border-brand-accent/50'
          }`}
          title="Click to view all qualified leads"
        >
          <div className="flex items-center justify-between text-brand-muted mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider font-body">Qualified Leads</span>
            <span className="text-base">👥</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-display font-extrabold text-brand-text">
              {totalQualified}
            </span>
            <span className="text-xs font-semibold text-emerald-600 font-body">Active</span>
          </div>
          <p className="text-[11px] text-brand-muted mt-1 font-body">Hot & Warm Prospects</p>
        </button>

        {/* Metric 2: Hot Leads (Click to filter HOT) */}
        <button
          type="button"
          onClick={() => handleCardFilter('HOT')}
          className={`text-left rounded-xl p-4 shadow-sm transition-all cursor-pointer border relative ${
            filterScore === 'HOT'
              ? 'bg-rose-500/15 border-rose-500 ring-2 ring-rose-500/50 shadow-md scale-[1.01]'
              : 'bg-brand-card border-rose-500/30 hover:border-rose-500/70 hover:shadow-md bg-gradient-to-br from-rose-500/[0.04] to-transparent'
          }`}
          title="Click to filter Hot leads (Site visits scheduled)"
        >
          <div className="flex items-center justify-between text-rose-600 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider font-body">🔥 Hot Pipeline</span>
            {filterScore === 'HOT' ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500 text-white">
                Filtered ✓
              </span>
            ) : (
              <span className="text-base">🔥</span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-display font-extrabold text-rose-600">
              {totalHot}
            </span>
            {totalSiteVisits > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-700">
                {totalSiteVisits} visits
              </span>
            )}
          </div>
          <p className="text-[11px] text-brand-muted mt-1 font-body flex items-center justify-between">
            <span>Site Visits & High Intent</span>
            <span className="text-[10px] text-rose-600 font-semibold underline">View ↓</span>
          </p>
        </button>

        {/* Metric 3: Warm Inquiries (Click to filter WARM) */}
        <button
          type="button"
          onClick={() => handleCardFilter('WARM')}
          className={`text-left rounded-xl p-4 shadow-sm transition-all cursor-pointer border relative ${
            filterScore === 'WARM'
              ? 'bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/50 shadow-md scale-[1.01]'
              : 'bg-brand-card border-amber-500/30 hover:border-amber-500/70 hover:shadow-md bg-gradient-to-br from-amber-500/[0.04] to-transparent'
          }`}
          title="Click to filter Warm prospects (Budget & requirements noted)"
        >
          <div className="flex items-center justify-between text-amber-600 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider font-body">⚡ Warm Inquiries</span>
            {filterScore === 'WARM' ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-black">
                Filtered ✓
              </span>
            ) : (
              <span className="text-base">⚡</span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-display font-extrabold text-amber-600">
              {totalWarm}
            </span>
            <span className="text-xs font-semibold text-brand-muted font-body">Engaged</span>
          </div>
          <p className="text-[11px] text-brand-muted mt-1 font-body flex items-center justify-between">
            <span>Budget & Requirements Noted</span>
            <span className="text-[10px] text-amber-600 font-semibold underline">View ↓</span>
          </p>
        </button>

        {/* Metric 4: Channel Distribution & Sentiment */}
        <div className="bg-brand-card border border-brand-border rounded-xl p-4 shadow-sm hover:border-brand-accent/50 transition">
          <div className="flex items-center justify-between text-brand-muted mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider font-body">Sentiment & Source</span>
            <span className="text-base">📊</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-display font-extrabold text-brand-text">
              {positivePercent}%
            </span>
            <span className="text-xs font-semibold text-emerald-600 font-body">Positive</span>
          </div>
          <p className="text-[11px] text-brand-muted mt-1 font-body truncate">
            📞 {totalInbound} Inbound · 🚀 {totalOutbound} Outbound
          </p>
        </div>
      </div>

      {/* 2. MAIN CONTAINER & CONTROLS TOOLBAR */}
      <div ref={pipelineRef} id="lead-pipeline-table" className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm">
        {/* Top Control Header */}
        <div className="px-5 py-4 border-b border-brand-border bg-brand-bg/40 space-y-3.5">
          {/* Row 1: Title, Search, and Action Buttons */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="font-display font-bold text-brand-text text-lg flex items-center">
                <Icons.Users />
                <span className="ml-2">Active Leads Pipeline</span>
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-body font-bold bg-brand-bg border border-brand-border text-brand-muted">
                {visibleLeads.length} {visibleLeads.length === totalQualified ? 'leads' : `of ${totalQualified}`}
              </span>
            </div>

            {/* Right side: Search + Export + View Mode Toggle */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search input */}
              <div className="relative min-w-[220px] sm:min-w-[260px] flex-1 sm:flex-initial">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search caller, phone, requirement..."
                  className="w-full h-8 pl-8 pr-7 text-xs rounded-lg bg-brand-bg border border-brand-border text-brand-text placeholder-brand-muted/70 focus:outline-none focus:border-brand-accent transition shadow-inner"
                />
                <span className="absolute left-2.5 top-2 text-brand-muted text-xs pointer-events-none">
                  🔍
                </span>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1.5 text-xs text-brand-muted hover:text-brand-text"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Export CSV Button */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="h-8 px-3 rounded-lg border border-brand-border bg-brand-bg hover:bg-brand-card hover:border-brand-accent/50 text-xs font-semibold text-brand-text transition flex items-center gap-1.5 shadow-sm shrink-0"
                title="Download leads as a CSV spreadsheet"
              >
                <span>📥</span>
                <span>Export CSV</span>
              </button>

              {/* View Mode Switcher */}
              <div className="inline-flex items-center bg-brand-bg border border-brand-border rounded-lg p-0.5 text-xs shrink-0">
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
                  <span>List</span>
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
          </div>

          {/* Row 2: Filter Segmented Pills (Source, Stage, and Agent) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-brand-border/40">
            {/* Source Channel Pills */}
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
                All Sources ({totalQualified})
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
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/25 font-body">{totalInbound}</span>
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
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/25 font-body">{totalOutbound}</span>
              </button>
            </div>

            {/* Right: Stage Filters (List Mode) or Bot Filter (if multiple bots) */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Optional Agent Filter if user has multiple bots */}
              {bots && bots.length > 1 && setSelectedBotId && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-body uppercase font-bold text-brand-muted">Agent:</span>
                  <select
                    value={selectedBotId}
                    onChange={(e) => setSelectedBotId(e.target.value)}
                    className="h-7 px-2 bg-brand-bg border border-brand-border rounded-lg text-xs font-bold text-brand-text focus:outline-none focus:border-brand-accent cursor-pointer"
                  >
                    <option value="all">All Receptionists ({leads.length})</option>
                    {bots.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.businessName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Stage Filter Pills in List View */}
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
                    All Stages
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterScore('HOT')}
                    className={`h-7 px-2.5 rounded-lg text-xs font-bold transition border flex items-center gap-1.5 ${
                      filterScore === 'HOT'
                        ? 'bg-rose-500 text-white border-rose-400 shadow-sm font-extrabold'
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
        </div>

        {/* 3. KANBAN BOARD VIEW */}
        {viewMode === 'kanban' ? (
          <div className="p-5 sm:p-6 overflow-x-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 min-w-[650px]">
              {kanbanStages.map((stage) => (
                <div
                  key={stage.id}
                  className="bg-brand-bg/50 border border-brand-border rounded-xl flex flex-col max-h-[800px] overflow-hidden shadow-inner"
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
                  <div className="p-3.5 overflow-y-auto space-y-3.5 flex-1">
                    {stage.leads.length === 0 ? (
                      <div className="py-14 text-center text-brand-muted text-xs space-y-1">
                        <p className="font-medium">No leads in this stage</p>
                        <p className="text-[11px] text-brand-muted/70">
                          {searchQuery ? 'Try clearing your search query' : 'Voice qualified leads will appear here'}
                        </p>
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
                          {/* Card Top: Initials Avatar, Name & Quick Stage Dropdown */}
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              {/* Avatar circle */}
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-xs shrink-0 shadow-sm border ${
                                lead.leadScore === 'HOT'
                                  ? 'bg-rose-500/20 text-rose-700 border-rose-500/30'
                                  : 'bg-brand-bg text-brand-text border-brand-border'
                              }`}>
                                {getInitials(lead.name)}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h5 className="font-display font-bold text-brand-text text-sm leading-tight truncate">
                                    {lead.name}
                                  </h5>
                                  {lead.channel === 'outbound' ? (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-700">
                                      <span>🚀 Outbound</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-700">
                                      <span>📞 Inbound</span>
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 mt-1">
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(lead.phone, 'Phone number')}
                                    className="text-[11px] text-brand-muted hover:text-brand-text font-body truncate flex items-center gap-1"
                                    title="Click to copy phone number"
                                  >
                                    <span>📞 {lead.phone}</span>
                                    <span className="text-[10px] text-brand-muted/70 hover:text-brand-accent">📋</span>
                                  </button>
                                  {lead.date && (
                                    <span className="text-[10px] text-brand-muted/70 font-body truncate" title="Call Date & Time">
                                      🕒 {lead.date}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Quick Stage Move Dropdown */}
                            <select
                              value={lead.leadScore}
                              onChange={(e) => handleScoreChange(lead.id, e.target.value as any)}
                              disabled={updatingId === lead.id}
                              className="bg-brand-bg border border-brand-border rounded-md text-[11px] font-bold text-brand-text px-2 h-7 focus:outline-none focus:border-brand-accent cursor-pointer shrink-0 shadow-sm"
                              title="Move lead stage"
                            >
                              <option value="HOT">🔥 Hot</option>
                              <option value="WARM">⚡ Warm</option>
                              <option value="COLD">❄️ Cold</option>
                            </select>
                          </div>

                          {/* Sentiment & Budget & Requirement Badges */}
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
                              title="Change Caller Sentiment"
                            >
                              <option value="Positive" className="bg-brand-card text-emerald-700">😊 Positive</option>
                              <option value="Neutral" className="bg-brand-card text-slate-700">😐 Neutral</option>
                              <option value="No Response" className="bg-brand-card text-zinc-700">📵 No Response</option>
                              <option value="Urgent/Demanding" className="bg-brand-card text-amber-700">⚠️ Urgent</option>
                              <option value="Angry" className="bg-brand-card text-rose-700">😡 Angry</option>
                            </select>

                            {lead.budget && lead.budget !== 'N/A' && (
                              <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-700 font-semibold font-body text-[10px]">
                                💰 {lead.budget}
                              </span>
                            )}
                            {lead.requirement && (
                              <span className="px-2 py-0.5 rounded bg-brand-bg border border-brand-border text-brand-text font-medium truncate max-w-[180px] text-[10px]">
                                📋 {lead.requirement}
                              </span>
                            )}
                          </div>

                          {/* Site Visit / Appointment Status Badge */}
                          {lead.appointmentStatus && lead.appointmentStatus !== 'None' && lead.appointmentStatus !== 'Not Scheduled' && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-700 text-xs font-bold">
                              <Icons.Calendar />
                              <span>Site Visit: {lead.appointmentStatus}</span>
                            </div>
                          )}

                          {/* AI Voice Call Summary Snippet */}
                          {lead.summary && (
                            <div className="bg-brand-bg/50 p-2.5 rounded-lg border border-brand-border/50 text-xs">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-accent block mb-0.5">
                                ✨ Call Key Takeaways
                              </span>
                              <p className="text-brand-text line-clamp-3 font-sans leading-relaxed">
                                {lead.summary === 'Customer did not reply'
                                  ? 'Caller connected — requirement details logged from voice conversation.'
                                  : lead.summary}
                              </p>
                            </div>
                          )}

                          {/* Card Bottom Actions */}
                          <div className="pt-2.5 border-t border-brand-border/60 flex items-center justify-between gap-1.5">
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
                              onClick={() => handleCopyLeadSummary(lead)}
                              className="h-8 px-2.5 flex items-center justify-center gap-1 rounded-lg border border-brand-border bg-brand-bg hover:bg-brand-card hover:border-brand-accent/50 text-brand-muted hover:text-brand-text transition text-xs shadow-sm font-semibold"
                              title="Copy lead notes & details for sharing"
                            >
                              <span>📋</span>
                              <span className="hidden sm:inline">Copy Info</span>
                            </button>

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
          /* 4. MODERN LIST VIEW */
          <div className="divide-y divide-brand-border">
            {visibleLeads.length === 0 ? (
              <div className="p-12 text-center text-brand-muted space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-brand-bg border border-brand-border flex items-center justify-center text-xl">
                  {searchQuery ? '🔍' : '👥'}
                </div>
                <div className="space-y-1">
                  <p className="text-base font-display font-bold text-brand-text">
                    {searchQuery
                      ? `No leads match "${searchQuery}"`
                      : selectedBotId === 'all'
                      ? 'No qualified leads recorded yet.'
                      : 'No qualified leads recorded yet for this receptionist.'}
                  </p>
                  <p className="text-xs text-brand-muted max-w-md mx-auto leading-relaxed">
                    {searchQuery
                      ? 'Try adjusting your search terms or resetting filters.'
                      : 'New qualified leads will appear here automatically with call recordings and AI conversation summaries when callers speak with your AI receptionist or receive an outbound campaign dial.'}
                  </p>
                </div>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border bg-brand-bg hover:border-brand-accent text-xs font-semibold text-brand-text transition"
                  >
                    <span>Clear Search Filter</span>
                  </button>
                )}
              </div>
            ) : (
              paginatedLeads.map((lead) => (
                <div
                  key={lead.id}
                  id={`lead-row-${lead.id}`}
                  className={`p-5 sm:p-6 transition flex flex-col lg:flex-row justify-between gap-5 lg:items-center card-hover-glow ${
                    lead.id === highlightedLeadId
                      ? 'ring-2 ring-emerald-500 bg-emerald-500/10 shadow-lg'
                      : lead.leadScore === 'HOT'
                      ? 'bg-rose-500/[0.04] border-l-4 border-l-rose-500'
                      : 'hover:bg-brand-bg/30'
                  }`}
                >
                  {/* Lead Information Column */}
                  <div className="space-y-3.5 flex-1 min-w-0">
                    {/* Header Row: Initials Avatar, Name, Source Badge, Phone, Call Time */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Avatar Circle */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-display font-bold text-xs shrink-0 shadow-sm border ${
                        lead.leadScore === 'HOT'
                          ? 'bg-rose-500/20 text-rose-700 border-rose-500/30'
                          : 'bg-brand-bg text-brand-text border-brand-border'
                      }`}>
                        {getInitials(lead.name)}
                      </div>

                      <h4 className="text-base sm:text-lg font-display font-bold text-brand-text">
                        {lead.name}
                      </h4>

                      {/* Source Channel Badge */}
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

                      {/* Phone Link with 1-Click Copy */}
                      <div className="inline-flex items-center rounded-lg bg-brand-bg border border-brand-border text-xs text-brand-muted font-body overflow-hidden shadow-sm">
                        <a
                          href={`tel:${lead.phone}`}
                          className="px-2.5 py-1 hover:text-brand-accent transition flex items-center gap-1 font-semibold"
                          title="Call directly"
                        >
                          <span>📞</span>
                          <span>{lead.phone}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(lead.phone, 'Phone number')}
                          className="px-2 py-1 border-l border-brand-border/60 hover:bg-brand-card hover:text-brand-text transition"
                          title="Copy phone number"
                        >
                          📋
                        </button>
                      </div>

                      {lead.email && (
                        <span className="text-xs text-brand-muted font-body px-2.5 py-1 rounded-lg bg-brand-bg border border-brand-border flex items-center gap-1 shadow-sm">
                          <span>✉️</span>
                          <span>{lead.email}</span>
                        </span>
                      )}

                      {/* Call Timestamp */}
                      <span
                        className="text-xs font-body px-2.5 py-1 rounded-lg bg-brand-bg/80 border border-brand-border/80 flex items-center gap-1.5 shadow-sm text-brand-muted"
                        title="Exact timestamp when this voice call inquiry occurred"
                      >
                        <span className="text-brand-accent text-xs">🕒</span>
                        <span className="text-[10px] uppercase font-bold text-brand-accent/90 tracking-wider">
                          Call Time:
                        </span>
                        <span className="text-brand-text font-semibold">{lead.date}</span>
                      </span>
                    </div>

                    {/* Requirement and Budget Specifications Box */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-brand-text bg-brand-bg/60 border border-brand-border p-3.5 rounded-xl shadow-inner">
                      <div>
                        <span className="text-[10px] text-brand-muted block uppercase font-bold font-body tracking-wider mb-0.5">
                          📋 Client Requirement & Inquiries:
                        </span>
                        <span className="font-medium text-xs sm:text-sm text-brand-text">
                          {lead.requirement || 'Logged from voice discussion'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-brand-muted block uppercase font-bold font-body tracking-wider mb-0.5">
                          💰 Budget / Pricing Discussion:
                        </span>
                        <span className="text-brand-accent font-semibold text-xs sm:text-sm font-body">
                          {lead.budget && lead.budget !== 'N/A' ? lead.budget : 'Discussed on call'}
                        </span>
                      </div>
                    </div>

                    {/* AI Voice Call Summary Box */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-brand-accent font-bold uppercase tracking-wider block font-body">
                          ✨ AI Voice Call Summary & Next Steps:
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-brand-text leading-relaxed bg-brand-bg/30 border-l-2 border-brand-accent pl-3.5 py-2 rounded-r-md font-sans">
                        {lead.summary === 'Customer did not reply'
                          ? 'Caller connected — requirement details logged from voice conversation.'
                          : lead.summary || 'Caller connected — conversation transcript recorded in Call Logs.'}
                      </p>
                    </div>
                  </div>

                  {/* Lead Status & Interactive Controls Column */}
                  <div className="flex flex-row flex-wrap lg:flex-nowrap lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-3 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-brand-border/60">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Interactive Sentiment Selector */}
                      <select
                        value={lead.sentiment || (lead.summary === 'Customer did not reply' ? 'No Response' : 'Neutral')}
                        onChange={(e) => handleSentimentChange(lead.id, e.target.value)}
                        disabled={updatingId === lead.id}
                        className={`h-7 px-2.5 text-[10px] font-bold rounded-full border font-body transition-colors cursor-pointer focus:outline-none shadow-sm ${
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
                        title="Caller Sentiment Analysis"
                      >
                        <option value="Positive" className="bg-brand-card text-emerald-700">😊 Positive</option>
                        <option value="Neutral" className="bg-brand-card text-slate-700">😐 Neutral</option>
                        <option value="No Response" className="bg-brand-card text-zinc-700">📵 No Response</option>
                        <option value="Urgent/Demanding" className="bg-brand-card text-amber-700">⚠️ Urgent</option>
                        <option value="Angry" className="bg-brand-card text-rose-700">😡 Angry</option>
                      </select>

                      {/* Interactive Stage Move Dropdown in List View */}
                      <select
                        value={lead.leadScore}
                        onChange={(e) => handleScoreChange(lead.id, e.target.value as any)}
                        disabled={updatingId === lead.id}
                        className={`h-7 px-2.5 text-xs font-bold rounded-full border shadow-sm transition-all cursor-pointer focus:outline-none ${
                          lead.leadScore === 'HOT'
                            ? 'bg-rose-500/20 text-rose-700 border-rose-500/60 font-extrabold'
                            : lead.leadScore === 'WARM'
                            ? 'bg-amber-500/20 text-amber-700 border-amber-500/50'
                            : 'bg-cyan-500/20 text-cyan-700 border-cyan-400/40'
                        }`}
                        title="Promote or update lead stage"
                      >
                        <option value="HOT" className="bg-brand-card text-rose-700">🔥 Hot Lead</option>
                        <option value="WARM" className="bg-brand-card text-amber-700">⚡ Warm Prospect</option>
                        <option value="COLD" className="bg-brand-card text-slate-600">❄️ Move to Cold</option>
                      </select>
                    </div>

                    {/* Site Visit / Scheduled Appointment Details */}
                    {lead.appointmentStatus && lead.appointmentStatus !== 'None' && lead.appointmentStatus !== 'Not Scheduled' ? (
                      <div className="lg:text-right">
                        <span className="text-[10px] text-brand-muted font-bold uppercase tracking-wider block font-body">
                          📅 Scheduled Site Visit:
                        </span>
                        <span className="text-xs font-sans font-bold inline-flex items-center gap-1.5 mt-0.5 px-2.5 py-1 rounded-md bg-rose-500/15 text-rose-700 border border-rose-500/30 shadow-sm">
                          <Icons.Calendar />
                          <span>{lead.appointmentStatus}</span>
                        </span>
                      </div>
                    ) : null}

                    {/* Bottom Action Buttons: Audio Recording + WhatsApp + Copy Notes + Delete */}
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
                        onClick={() => handleCopyLeadSummary(lead)}
                        className="h-8 px-2.5 flex items-center justify-center gap-1 rounded-lg border border-brand-border bg-brand-bg hover:bg-brand-card hover:border-brand-accent/50 text-brand-muted hover:text-brand-text transition text-xs shadow-sm font-semibold"
                        title="Copy lead notes & details for sharing"
                      >
                        <span>📋</span>
                        <span className="hidden sm:inline">Copy Info</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteLead(lead.id)}
                        disabled={deletingId === lead.id}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-brand-border bg-brand-bg hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-700 text-brand-muted transition text-xs shadow-sm"
                        title="Archive Lead (Soft-delete)"
                      >
                        <Icons.Trash />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Pagination Controls */}
            {visibleLeads.length > 0 && (
              <div className="px-5 py-3.5 border-t border-brand-border bg-brand-bg/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-brand-muted">
                <div className="flex items-center gap-2">
                  <span>
                    Showing <span className="font-bold text-brand-text">{(safeCurrentPage - 1) * pageSize + 1}</span> to{' '}
                    <span className="font-bold text-brand-text">{Math.min(safeCurrentPage * pageSize, visibleLeads.length)}</span> of{' '}
                    <span className="font-bold text-brand-text">{visibleLeads.length}</span> leads
                  </span>
                  <div className="flex items-center gap-1 ml-3 border-l border-brand-border pl-3">
                    <span className="text-[11px]">Per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="bg-brand-bg border border-brand-border rounded px-2 py-0.5 text-xs text-brand-text cursor-pointer"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-brand-border bg-brand-bg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-card text-brand-text font-semibold transition"
                  >
                    ← Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - safeCurrentPage) <= 1)
                    .map((p, idx, arr) => (
                      <React.Fragment key={p}>
                        {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-brand-muted">…</span>}
                        <button
                          type="button"
                          onClick={() => setCurrentPage(p)}
                          className={`w-7 h-7 rounded text-xs font-bold transition ${
                            p === safeCurrentPage
                              ? 'bg-brand-accent text-primary-foreground shadow-sm'
                              : 'hover:bg-brand-card text-brand-muted border border-brand-border'
                          }`}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    ))}
                  <button
                    type="button"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-brand-border bg-brand-bg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-card text-brand-text font-semibold transition"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
