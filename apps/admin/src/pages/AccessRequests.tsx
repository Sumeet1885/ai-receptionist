import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { LIMITS } from '@ai-receptionist/contracts';
import {
  AlertCircle, Building2, CheckCircle2, ChevronLeft, ChevronRight, Globe, Inbox, Languages, Loader2, Mail,
  MapPin, Phone, Search, Send, UserRound, X,
} from 'lucide-react';
import {
  accessRequestApi,
  type AccessRequestAccount,
  type AccessRequestDetail,
  type AccessRequestList,
  type AccessRequestStatus,
} from '../api';
import { useLive } from '../live';
import { Button, Card, CharCount, PageError, STATUS_LABELS, StatusBadge, cx, formatDate, initials, timeAgo } from '../ui';

const TABS: Array<AccessRequestStatus | 'all'> = ['pending', 'contacted', 'approved', 'rejected', 'all'];
const VOLUME_LABELS: Record<string, string> = {
  under_100: 'Under 100 / month',
  '100_500': '100 – 500 / month',
  '500_2000': '500 – 2,000 / month',
  over_2000: 'More than 2,000 / month',
};

const FIELD = 'w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-subtle/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function initialTab(): AccessRequestStatus | 'all' {
  const status = new URLSearchParams(window.location.search).get('status');
  return TABS.includes(status as AccessRequestStatus) ? status as AccessRequestStatus : 'pending';
}

function setQuery(key: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState({}, '', url);
}

export function AccessRequests({ roles }: { roles: string[] }) {
  const canTriage = roles.includes('support') || roles.includes('super_admin');
  const canApprove = roles.includes('super_admin');
  const { version, lastEvent } = useLive();

  const [tab, setTab] = useState<AccessRequestStatus | 'all'>(initialTab);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<AccessRequestList | null>(null);
  const [listError, setListError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('request'));

  const loadList = useCallback(async () => {
    try {
      setList(await accessRequestApi.list({ status: tab === 'all' ? undefined : tab, search: appliedSearch, page }));
      setListError('');
    } catch (err) {
      setListError((err as Error).message);
    }
  }, [tab, appliedSearch, page]);

  useEffect(() => {
    void loadList();
  }, [loadList, version]);

  const select = (id: string | null) => {
    setSelectedId(id);
    setQuery('request', id);
  };

  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Access requests</h1>
          <p className="mt-1 text-sm text-subtle">Businesses asking for free access. Approve to create their workspace and send the activation email.</p>
        </div>
        <form
          className="flex w-full max-w-md gap-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setPage(1);
            setAppliedSearch(search.trim());
          }}
        >
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input type="search" className={cx(FIELD, 'h-10 pl-9')} placeholder="Search name, email, business, phone" maxLength={LIMITS.search.max} value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search requests" />
          </label>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((key) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => { setTab(key); setPage(1); setQuery('status', key === 'pending' ? null : key); }}
              className={cx(
                'inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-subtle hover:border-primary/40 hover:text-ink',
              )}
            >
              {key === 'all' ? 'All' : STATUS_LABELS[key]}
              {key !== 'all' && list && (
                <span className={cx('rounded-full px-1.5 text-xs', active ? 'bg-white/20' : 'bg-background', key === 'pending' && list.counts.pending > 0 && !active && 'bg-orange text-white')}>
                  {list.counts[key]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className={cx('grid items-start gap-5', selectedId && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]')}>
        <Card className="overflow-hidden">
          {listError && <div className="m-4"><PageError message={listError} onRetry={() => void loadList()} /></div>}
          {!list && !listError && (
            <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-background" />)}</div>
          )}
          {list && list.rows.length === 0 && (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Inbox className="h-6 w-6" /></span>
              <p className="mt-3 font-semibold">No requests here</p>
              <p className="text-sm text-subtle">{appliedSearch ? 'Try a different search.' : 'New requests appear the moment they arrive.'}</p>
            </div>
          )}
          {list && list.rows.length > 0 && (
            <ul className="divide-y divide-line">
              {list.rows.map((row) => {
                const selected = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => select(row.id)}
                      className={cx(
                        'flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors',
                        selected ? 'bg-primary-soft' : 'hover:bg-background',
                      )}
                    >
                      <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold', selected ? 'bg-primary text-white' : 'bg-primary-soft text-primary')}>
                        {initials(row.business_name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{row.business_name}</span>
                        <span className="block truncate text-xs text-subtle">{row.full_name} · {row.email}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge status={row.status} />
                        <span className="text-[11px] text-subtle" title={formatDate(row.created_at)}>{timeAgo(row.created_at)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {list && pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-4 py-3">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-3.5 w-3.5" /> Previous</Button>
              <span className="text-xs text-subtle">Page {page} of {pages}</span>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next <ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          )}
        </Card>

        {selectedId && (
          <RequestDetail
            key={selectedId}
            id={selectedId}
            version={lastEvent?.id === selectedId ? version : 0}
            canTriage={canTriage}
            canApprove={canApprove}
            onClose={() => select(null)}
            onChanged={() => void loadList()}
          />
        )}
      </div>
    </div>
  );
}

function Fact({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-subtle"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{label}</p>
        <div className="break-words text-sm">{children}</div>
      </div>
    </div>
  );
}

function RequestDetail({ id, version, canTriage, canApprove, onClose, onChanged }: {
  id: string;
  version: number;
  canTriage: boolean;
  canApprove: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [request, setRequest] = useState<AccessRequestDetail | null>(null);
  const [account, setAccount] = useState<AccessRequestAccount | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<'view' | 'approve' | 'reject'>('view');
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    accessRequestApi.get(id)
      .then((data) => {
        setRequest(data.request);
        setAccount(data.account);
        setNotes(data.request.admin_notes ?? '');
        setError('');
      })
      .catch((err) => setError((err as Error).message));
  }, [id, version]);

  const run = async (action: () => Promise<{ request: AccessRequestDetail }>, done: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await action();
      setRequest(result.request);
      setMessage(done);
      setMode('view');
      onChanged();
      const fresh = await accessRequestApi.get(id);
      setAccount(fresh.account);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!request) {
    return (
      <Card className="p-6">
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : <div className="h-40 animate-pulse rounded-xl bg-background" />}
        <Button variant="ghost" size="sm" className="mt-3" onClick={onClose}>Close</Button>
      </Card>
    );
  }

  const open = request.status === 'pending' || request.status === 'contacted';

  return (
    <Card className="overflow-hidden lg:sticky lg:top-6">
      <div className="relative bg-ink px-6 pb-5 pt-6 text-white">
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lime font-display text-lg font-bold text-ink">{initials(request.business_name)}</span>
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-bold">{request.business_name}</h2>
            <p className="text-sm text-white/70">{request.industry} · submitted {timeAgo(request.created_at)}</p>
          </div>
        </div>
        <div className="mt-4"><StatusBadge status={request.status} /></div>
      </div>

      <div className="space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Fact icon={UserRound} label="Contact">{request.full_name}</Fact>
          <Fact icon={Mail} label="Email"><a className="text-primary hover:underline" href={`mailto:${request.email}`}>{request.email}</a></Fact>
          <Fact icon={Phone} label="Phone"><a className="text-primary hover:underline" href={`tel:${request.phone}`}>{request.phone}</a></Fact>
          <Fact icon={Globe} label="Website">
            {request.website ? <a className="text-primary hover:underline" href={request.website} target="_blank" rel="noopener noreferrer nofollow">{request.website}</a> : '—'}
          </Fact>
          <Fact icon={MapPin} label="City">{request.city ?? '—'}</Fact>
          <Fact icon={Building2} label="Volume">{request.monthly_volume ? VOLUME_LABELS[request.monthly_volume] ?? request.monthly_volume : '—'}</Fact>
          <Fact icon={Languages} label="Languages">{request.languages.length ? request.languages.join(', ') : '—'}</Fact>
          <Fact icon={CheckCircle2} label="Reviewed">{formatDate(request.reviewed_at)}</Fact>
        </div>

        {request.use_case && (
          <div className="rounded-2xl bg-background p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">What they want</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{request.use_case}</p>
          </div>
        )}

        {request.status === 'rejected' && request.rejection_reason && (
          <div className="rounded-2xl bg-danger-surface p-4 text-sm text-danger">
            <p className="text-[11px] font-semibold uppercase tracking-wider">Rejection reason</p>
            <p className="mt-1">{request.rejection_reason}</p>
          </div>
        )}

        {request.status === 'approved' && (
          <div className={cx('flex items-start gap-3 rounded-2xl p-4 text-sm', account?.activated ? 'bg-success-surface text-success' : 'bg-warning-surface text-warning')}>
            {account?.activated ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Send className="mt-0.5 h-4 w-4 shrink-0" />}
            <p>
              {account?.activated
                ? account.onboardingCompleted ? 'Workspace activated and onboarded.' : 'Workspace activated; onboarding in progress.'
                : `Waiting for activation. Link sent ${request.activation_send_count}× (last ${formatDate(request.activation_sent_at)}).`}
            </p>
          </div>
        )}

        {canTriage && (
          <div>
            <label htmlFor="admin-notes" className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Internal notes</label>
            <textarea id="admin-notes" rows={3} maxLength={LIMITS.adminNotes.max} className={cx(FIELD, 'mt-1.5 resize-y')} placeholder="Only admins see these notes." value={notes} onChange={(e) => setNotes(e.target.value)} />
            <CharCount value={notes} max={LIMITS.adminNotes.max} />
            {notes !== (request.admin_notes ?? '') && (
              <Button variant="secondary" size="sm" className="mt-2" disabled={busy} onClick={() => run(() => accessRequestApi.saveNotes(id, notes), 'Notes saved.')}>Save notes</Button>
            )}
          </div>
        )}

        {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-danger-surface px-3 py-2 text-sm text-danger"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</p>}
        {message && <p role="status" className="flex items-center gap-2 rounded-xl bg-success-surface px-3 py-2 text-sm text-success"><CheckCircle2 className="h-4 w-4 shrink-0" /> {message}</p>}

        {mode === 'approve' && (
          <div className="rounded-2xl border border-primary/30 bg-primary-soft p-4">
            <p className="text-sm font-semibold">Create a workspace for {request.email}?</p>
            <p className="mt-1 text-sm text-subtle">They get an email with a one-time link to confirm their address and choose a password.</p>
            <div className="mt-3 flex gap-2">
              <Button variant="success" disabled={busy} onClick={() => run(() => accessRequestApi.approve(id), 'Approved. The activation email has been sent.')}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve and send
              </Button>
              <Button variant="ghost" onClick={() => setMode('view')}>Cancel</Button>
            </div>
          </div>
        )}

        {mode === 'reject' && (
          <form
            className="space-y-3 rounded-2xl border border-danger/30 bg-danger-surface/50 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => accessRequestApi.reject(id, reason, notify), 'Request rejected.');
            }}
          >
            <label className="block">
              <span className="text-sm font-semibold">Reason <span className="font-normal text-subtle">(optional; included in the email if sent)</span></span>
              <textarea rows={3} maxLength={LIMITS.rejectionReason.max} className={cx(FIELD, 'mt-1.5')} value={reason} onChange={(e) => setReason(e.target.value)} />
              <CharCount value={reason} max={LIMITS.rejectionReason.max} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email the requester
            </label>
            <div className="flex gap-2">
              <Button type="submit" variant="danger" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Confirm reject</Button>
              <Button variant="ghost" onClick={() => setMode('view')}>Cancel</Button>
            </div>
          </form>
        )}

        {mode === 'view' && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            {canApprove && open && (
              <Button variant="success" disabled={busy} onClick={() => setMode('approve')}><CheckCircle2 className="h-4 w-4" /> Approve and provision</Button>
            )}
            {canTriage && request.status === 'pending' && (
              <Button variant="secondary" disabled={busy} onClick={() => run(() => accessRequestApi.markContacted(id), 'Marked as contacted.')}>
                <Phone className="h-4 w-4" /> Mark contacted
              </Button>
            )}
            {canTriage && request.status === 'approved' && account && !account.activated && (
              <Button variant="secondary" disabled={busy} onClick={() => run(() => accessRequestApi.resendActivation(id), 'A new activation link has been sent.')}>
                <Send className="h-4 w-4" /> Resend activation
              </Button>
            )}
            {canTriage && open && (
              <Button variant="dangerOutline" disabled={busy} onClick={() => setMode('reject')}><X className="h-4 w-4" /> Reject</Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
