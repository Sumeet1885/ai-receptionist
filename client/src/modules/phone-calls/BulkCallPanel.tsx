import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icons } from '../../components/common/Icons';
import { Campaign, CampaignContact, campaignApi } from './campaignApi';

interface BulkCallPanelProps {
  botId: string;
  isProvisioned: boolean;
  showToast: (message: string, type?: 'success' | 'error') => void;
}


function UploadZone({
  onFileSelected,
  disabled,
}: {
  onFileSelected: (file: File) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
  };

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
        ${dragging ? 'border-brand-accent bg-brand-accent/5 scale-[1.01]' : 'border-brand-border hover:border-brand-accent/50 hover:bg-brand-bg/60'}
        ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelected(f); e.target.value = ''; }}
      />
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-accent">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-brand-text">Drop your Excel or CSV file here</p>
          <p className="text-xs text-brand-muted mt-1">or click to browse — .xlsx, .xls, .csv supported</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Campaign['status'] }) {
  const map: Record<Campaign['status'], { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'text-brand-muted border-brand-border bg-brand-card' },
    running: { label: '▶ Running', cls: 'text-green-400 border-green-500/30 bg-green-500/10 animate-pulse' },
    paused: { label: '⏸ Paused', cls: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' },
    completed: { label: '✓ Completed', cls: 'text-brand-accent border-brand-accent/30 bg-brand-accent/10' },
    failed: { label: '✗ Failed', cls: 'text-brand-danger border-brand-danger/30 bg-brand-danger/10' },
  };
  const { label, cls } = map[status] ?? map.pending;
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${cls}`}>{label}</span>
  );
}

function LeadScoreBadge({ score }: { score: string | null }) {
  if (!score) return null;
  const cls = score === 'HOT' ? 'text-orange-400 border-orange-400/30 bg-orange-400/10'
    : score === 'WARM' ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10'
    : score === 'HANGUP' ? 'text-red-400 border-red-400/30 bg-red-400/10'
    : score === 'NO_ANSWER' ? 'text-blue-400 border-blue-400/30 bg-blue-400/10'
    : 'text-brand-muted border-brand-border bg-brand-card';
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${cls}`}>{score}</span>
  );
}

function ContactStatusDot({ status }: { status: CampaignContact['call_status'] }) {
  const map: Record<CampaignContact['call_status'], string> = {
    pending: 'bg-brand-border',
    calling: 'bg-yellow-400 animate-pulse',
    done: 'bg-brand-accent',
    failed: 'bg-brand-danger',
    skipped: 'bg-brand-muted',
    not_pickup: 'bg-yellow-500/70',
  };
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${map[status]}`} />;
}

function ProgressBar({ total, called }: { total: number; called: number }) {
  const pct = total > 0 ? Math.round((called / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-brand-muted">
        <span>{called} of {total} called</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-brand-bg overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}


export const BulkCallPanel: React.FC<BulkCallPanelProps> = ({ botId, isProvisioned, showToast }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [hourlyCap, setHourlyCap] = useState('100');
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<{ phone_number: string; name: string | null }[] | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [campaignDetail, setCampaignDetail] = useState<{ campaign: Campaign; contacts: CampaignContact[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null); // campaignId being acted on
  const [exporting, setExporting] = useState<string | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ── Load campaigns ──────────────────────────────────────────────────────────

  const loadCampaigns = useCallback(async () => {
    try {
      const data = await campaignApi.list(botId);
      setCampaigns(data.campaigns);
    } catch (err: any) {
      showToast(err.message || 'Could not load campaigns', 'error');
    } finally {
      setLoadingCampaigns(false);
    }
  }, [botId, showToast]);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);


  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const data = await campaignApi.get(id);
      setCampaignDetail(data);
      setCampaigns(prev => prev.map(c => c.id === id ? { ...data.campaign } : c));
    } catch (err: any) {
      showToast(err.message || 'Could not load campaign details', 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (!activeCampaignId) return;

    void loadDetail(activeCampaignId);

    pollRef.current = setInterval(async () => {
      try {
        const data = await campaignApi.get(activeCampaignId);
        setCampaignDetail(data);
        setCampaigns(prev => prev.map(c => c.id === activeCampaignId ? { ...data.campaign } : c));
        if (data.campaign.status === 'completed' || data.campaign.status === 'failed') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      } catch (_) {}
    }, 5000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeCampaignId, loadDetail]);


  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setUploadPreview(null);
    if (!campaignName) setCampaignName(file.name.replace(/\.[^.]+$/, ''));
  };


  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const cap = Number(hourlyCap);
      const result = await campaignApi.upload(
        botId,
        selectedFile,
        campaignName || selectedFile.name,
        Number.isFinite(cap) && cap >= 1 ? cap : undefined,
      );
      showToast(`Campaign created! ${result.contactCount} contacts imported.`, 'success');
      setUploadPreview(result.preview);
      await loadCampaigns();
      setActiveCampaignId(result.campaignId);
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
      setSelectedFile(null);
    }
  };


  const handleStart = async (campaignId: string) => {
    setActionLoading(campaignId);
    try {
      await campaignApi.start(campaignId);
      showToast('Campaign started. Calls will begin momentarily.', 'success');
      await loadCampaigns();
      if (activeCampaignId === campaignId) await loadDetail(campaignId);
    } catch (err: any) {
      showToast(err.message || 'Failed to start campaign', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (campaignId: string) => {
    setActionLoading(campaignId);
    try {
      await campaignApi.pause(campaignId);
      showToast('Campaign paused.', 'success');
      await loadCampaigns();
      if (activeCampaignId === campaignId) await loadDetail(campaignId);
    } catch (err: any) {
      showToast(err.message || 'Failed to pause campaign', 'error');
    } finally {
      setActionLoading(null);
    }
  };


  const handleDelete = async (campaignId: string) => {
    if (!confirm('Delete this campaign and all its contacts? This cannot be undone.')) return;
    setActionLoading(campaignId);
    try {
      await campaignApi.delete(campaignId);
      showToast('Campaign deleted.', 'success');
      if (activeCampaignId === campaignId) {
        setActiveCampaignId(null);
        setCampaignDetail(null);
      }
      await loadCampaigns();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete campaign', 'error');
    } finally {
      setActionLoading(null);
    }
  };


  const handleExport = async (campaignId: string, name: string) => {
    setExporting(campaignId);
    try {
      await campaignApi.export(campaignId, name);
      showToast('Summary downloaded!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Export failed', 'error');
    } finally {
      setExporting(null);
    }
  };


  return (
    <section className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 sm:px-6 py-4 border-b border-brand-border flex items-center justify-between gap-3 bg-brand-bg/40">
        <div>
          <h3 className="font-display font-bold text-brand-text text-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Bulk Call Campaign
          </h3>
          <p className="text-xs text-brand-muted mt-1">Upload an Excel sheet to start an automated outbound call campaign.</p>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {!isProvisioned ? (
          <div className="py-6 text-center text-brand-muted">
            <p className="text-sm">Provision the phone agent and assign a number before creating a campaign.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-brand-muted">New Campaign</h4>

              <UploadZone onFileSelected={handleFileSelected} disabled={uploading} />

              {selectedFile && (
                <div className="rounded-lg border border-brand-accent/30 bg-brand-accent/5 px-4 py-3 flex items-center gap-3">
                  <svg className="w-4 h-4 text-brand-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs text-brand-text font-medium flex-1 truncate">{selectedFile.name}</span>
                  <button type="button" onClick={() => setSelectedFile(null)} className="text-brand-muted hover:text-brand-danger text-xs">✕</button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-brand-muted">Campaign name</span>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                    placeholder="e.g. July Follow-ups"
                    className="h-10 px-3 rounded-lg bg-brand-bg border border-brand-border text-sm text-brand-text"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-brand-muted">Max calls / hour <span className="text-brand-accent">(campaign override)</span></span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={hourlyCap}
                    onChange={e => setHourlyCap(e.target.value)}
                    className="h-10 px-3 rounded-lg bg-brand-bg border border-brand-border text-sm text-brand-text"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="h-10 px-6 rounded-lg bg-brand-accent hover:bg-brand-accent-hover text-brand-bg text-sm font-bold disabled:opacity-40 transition-all flex items-center gap-2"
              >
                {uploading ? (
                  <><span className="animate-spin inline-block w-4 h-4 border-2 border-brand-bg/30 border-t-brand-bg rounded-full" /> Uploading…</>
                ) : (
                  <><Icons.Plus /> Upload & Create Campaign</>
                )}
              </button>
              {uploadPreview && uploadPreview.length > 0 && (
                <div className="rounded-lg border border-brand-border bg-brand-bg overflow-hidden">
                  <p className="text-xs text-brand-muted px-3 pt-2 pb-1 font-semibold uppercase tracking-wide">Preview (first 5 rows)</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-brand-border bg-brand-card">
                        <th className="px-3 py-2 text-left text-brand-muted font-semibold">Phone</th>
                        <th className="px-3 py-2 text-left text-brand-muted font-semibold">Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadPreview.map((row, i) => (
                        <tr key={i} className="border-b border-brand-border/50 last:border-0">
                          <td className="px-3 py-2 text-brand-text font-mono">{row.phone_number}</td>
                          <td className="px-3 py-2 text-brand-muted">{row.name ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="border-t border-brand-border pt-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wide text-brand-muted">Campaign History</h4>
                <button type="button" onClick={loadCampaigns} className="text-xs text-brand-accent hover:text-brand-accent-hover flex items-center gap-1">
                  <Icons.Refresh /> Refresh
                </button>
              </div>

              {loadingCampaigns ? (
                <p className="text-sm text-brand-muted animate-pulse py-4 text-center">Loading campaigns…</p>
              ) : campaigns.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="mx-auto w-10 h-10 rounded-full bg-brand-bg border border-brand-border text-brand-muted flex items-center justify-center mb-3">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-sm text-brand-muted">No campaigns yet. Upload an Excel file to get started.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {campaigns.map(campaign => (
                    <div key={campaign.id} className="rounded-lg border border-brand-border bg-brand-bg overflow-hidden">
                      <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setActiveCampaignId(activeCampaignId === campaign.id ? null : campaign.id)}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-brand-text truncate">{campaign.name}</span>
                            <StatusBadge status={campaign.status} />
                          </div>
                          <p className="text-xs text-brand-muted mt-0.5">
                            {campaign.called_count}/{campaign.total_contacts} called · {new Date(campaign.created_at).toLocaleDateString()}
                            {campaign.hourly_cap_override ? ` · ${campaign.hourly_cap_override}/hr cap` : ''}
                          </p>
                        </button>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {(campaign.status === 'pending' || campaign.status === 'paused') && (
                            <button
                              type="button"
                              onClick={() => handleStart(campaign.id)}
                              disabled={actionLoading === campaign.id}
                              className="h-8 px-3 rounded-lg bg-brand-accent hover:bg-brand-accent-hover text-brand-bg text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                            >
                              {actionLoading === campaign.id ? '…' : '▶ Start'}
                            </button>
                          )}
                          {campaign.status === 'running' && (
                            <button
                              type="button"
                              onClick={() => handlePause(campaign.id)}
                              disabled={actionLoading === campaign.id}
                              className="h-8 px-3 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/30 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                            >
                              {actionLoading === campaign.id ? '…' : '⏸ Pause'}
                            </button>
                          )}
                          {(campaign.status === 'completed' || campaign.status === 'failed') && (
                            <button
                              type="button"
                              onClick={() => handleExport(campaign.id, campaign.name)}
                              disabled={exporting === campaign.id}
                              className="h-8 px-3 rounded-lg bg-brand-card border border-brand-border hover:border-brand-accent/60 text-brand-text text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                            >
                              {exporting === campaign.id ? '…' : (
                                <>
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
                                  </svg>
                                  Export
                                </>
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(campaign.id)}
                            disabled={actionLoading === campaign.id}
                            className="h-8 w-8 rounded-lg bg-brand-card border border-brand-border hover:border-brand-danger/60 hover:text-brand-danger text-brand-muted flex items-center justify-center disabled:opacity-50"
                          >
                            <Icons.Trash />
                          </button>
                        </div>
                      </div>

                      {campaign.total_contacts > 0 && (
                        <div className="px-4 pb-3">
                          <ProgressBar total={campaign.total_contacts} called={campaign.called_count} />
                        </div>
                      )}

                      {activeCampaignId === campaign.id && (
                        <div className="border-t border-brand-border">
                          {detailLoading ? (
                            <p className="text-xs text-brand-muted animate-pulse px-4 py-4 text-center">Loading contacts…</p>
                          ) : campaignDetail?.contacts && campaignDetail.contacts.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-brand-border bg-brand-card/50">
                                    <th className="px-3 py-2 text-left text-brand-muted font-semibold w-6">#</th>
                                    <th className="px-3 py-2 text-left text-brand-muted font-semibold">Status</th>
                                    <th className="px-3 py-2 text-left text-brand-muted font-semibold">Name</th>
                                    <th className="px-3 py-2 text-left text-brand-muted font-semibold">Phone</th>
                                    <th className="px-3 py-2 text-left text-brand-muted font-semibold">Score</th>
                                    <th className="px-3 py-2 text-left text-brand-muted font-semibold">Duration</th>
                                    <th className="px-3 py-2 text-left text-brand-muted font-semibold min-w-[160px]">Summary</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {campaignDetail.contacts.map((c, i) => (
                                    <tr key={c.id} className="border-b border-brand-border/40 last:border-0 hover:bg-brand-bg/50">
                                      <td className="px-3 py-2 text-brand-muted">{i + 1}</td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-1.5">
                                          <ContactStatusDot status={c.call_status} />
                                          <span className="text-brand-text">
                                            {c.call_status === 'not_pickup' ? 'Not Picked UP' : c.call_status}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-brand-text">{c.name ?? '—'}</td>
                                      <td className="px-3 py-2 text-brand-text font-mono">{c.phone_number}</td>
                                      <td className="px-3 py-2"><LeadScoreBadge score={c.lead_score} /></td>
                                      <td className="px-3 py-2 text-brand-muted">
                                        {c.call_duration ? `${c.call_duration}s` : '—'}
                                      </td>
                                      <td className="px-3 py-2 text-brand-muted max-w-[200px] truncate" title={c.call_summary ?? undefined}>
                                        {c.call_summary ?? (c.error_message ? <span className="text-brand-danger">{c.error_message}</span> : '—')}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-xs text-brand-muted px-4 py-4 text-center">No contacts yet.</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
};
