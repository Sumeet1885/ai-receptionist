import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  accessRequestApi,
  type AccessRequestAccount,
  type AccessRequestDetail,
  type AccessRequestList,
  type AccessRequestStatus,
} from './api';
import { useAdminEvents } from './useAdminEvents';

const STATUS_LABELS: Record<AccessRequestStatus, string> = {
  pending: 'Pending',
  contacted: 'Contacted',
  approved: 'Approved',
  rejected: 'Rejected',
};
const TABS: Array<AccessRequestStatus | 'all'> = ['pending', 'contacted', 'approved', 'rejected', 'all'];
const VOLUME_LABELS: Record<string, string> = {
  under_100: 'Under 100 / month',
  '100_500': '100 – 500 / month',
  '500_2000': '500 – 2,000 / month',
  over_2000: 'More than 2,000 / month',
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function initialRequestId() {
  return new URLSearchParams(window.location.search).get('request');
}

export function AccessRequests({ roles }: { roles: string[] }) {
  const canTriage = roles.includes('support') || roles.includes('super_admin');
  const canApprove = roles.includes('super_admin');

  const [tab, setTab] = useState<AccessRequestStatus | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<AccessRequestList | null>(null);
  const [listError, setListError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialRequestId);
  const [notice, setNotice] = useState('');

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
  }, [loadList]);

  const [detailVersion, setDetailVersion] = useState(0);
  const live = useAdminEvents((event) => {
    if (event.type === 'access_request.created') setNotice('New access request received.');
    void loadList();
    if (event.id === selectedId) setDetailVersion((v) => v + 1);
  });

  const select = (id: string | null) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('request', id);
    else url.searchParams.delete('request');
    window.history.replaceState({}, '', url);
  };

  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <div className="requests">
      <div className="requests-head">
        <div>
          <h1>Access requests</h1>
          <p className="muted small">
            <span className={`dot ${live ? 'on' : ''}`} aria-hidden="true" /> {live ? 'Live updates on' : 'Reconnecting to live updates…'}
          </p>
        </div>
        <form
          className="search"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setPage(1);
            setAppliedSearch(search.trim());
          }}
        >
          <input type="search" placeholder="Search name, email, business, phone" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search requests" />
          <button type="submit" className="secondary">Search</button>
        </form>
      </div>

      {notice && (
        <p className="notice" role="status">
          {notice} <button type="button" className="link" onClick={() => setNotice('')}>Dismiss</button>
        </p>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'tab active' : 'tab'}
            onClick={() => {
              setTab(key);
              setPage(1);
            }}
          >
            {key === 'all' ? 'All' : STATUS_LABELS[key]}
            {key !== 'all' && list && <span className="count">{list.counts[key]}</span>}
          </button>
        ))}
      </div>

      <div className="requests-body">
        <section className="card wide list" aria-label="Requests">
          {listError && <p className="error" role="alert">{listError}</p>}
          {!list && !listError && <p className="muted">Loading…</p>}
          {list && list.rows.length === 0 && <p className="muted">No requests here.</p>}
          {list && list.rows.length > 0 && (
            <ul className="rows">
              {list.rows.map((row) => (
                <li key={row.id}>
                  <button type="button" className={row.id === selectedId ? 'row selected' : 'row'} onClick={() => select(row.id)}>
                    <span className="row-main">
                      <strong>{row.business_name}</strong>
                      <span className="muted small">{row.full_name} · {row.email}</span>
                    </span>
                    <span className="row-meta">
                      <span className={`badge ${row.status}`}>{STATUS_LABELS[row.status]}</span>
                      <span className="muted small">{formatDate(row.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list && pages > 1 && (
            <div className="pager">
              <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="muted small">Page {page} of {pages}</span>
              <button type="button" className="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </section>

        {selectedId && (
          <RequestDetail
            key={selectedId}
            id={selectedId}
            version={detailVersion}
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
  const [rejecting, setRejecting] = useState(false);
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
      <aside className="card wide detail">
        {error ? <p className="error" role="alert">{error}</p> : <p className="muted">Loading…</p>}
        <button type="button" className="link" onClick={onClose}>Close</button>
      </aside>
    );
  }

  const open = request.status === 'pending' || request.status === 'contacted';

  return (
    <aside className="card wide detail" aria-label="Request details">
      <div className="detail-head">
        <div>
          <h2>{request.business_name}</h2>
          <span className={`badge ${request.status}`}>{STATUS_LABELS[request.status]}</span>
        </div>
        <button type="button" className="link" onClick={onClose}>Close</button>
      </div>

      <dl className="facts">
        <dt>Name</dt><dd>{request.full_name}</dd>
        <dt>Email</dt><dd><a href={`mailto:${request.email}`}>{request.email}</a></dd>
        <dt>Phone</dt><dd><a href={`tel:${request.phone}`}>{request.phone}</a></dd>
        <dt>Industry</dt><dd>{request.industry}</dd>
        <dt>Website</dt><dd>{request.website ? <a href={request.website} target="_blank" rel="noopener noreferrer nofollow">{request.website}</a> : '—'}</dd>
        <dt>City</dt><dd>{request.city ?? '—'}</dd>
        <dt>Volume</dt><dd>{request.monthly_volume ? VOLUME_LABELS[request.monthly_volume] ?? request.monthly_volume : '—'}</dd>
        <dt>Languages</dt><dd>{request.languages.length ? request.languages.join(', ') : '—'}</dd>
        <dt>Submitted</dt><dd>{formatDate(request.created_at)}</dd>
        <dt>Reviewed</dt><dd>{formatDate(request.reviewed_at)}</dd>
        {request.status === 'rejected' && <><dt>Reason</dt><dd>{request.rejection_reason ?? '—'}</dd></>}
        {request.status === 'approved' && (
          <>
            <dt>Activation</dt>
            <dd>
              {account?.activated
                ? account.onboardingCompleted ? 'Activated and onboarded' : 'Activated, onboarding in progress'
                : `Not activated yet · link sent ${request.activation_send_count}× (last ${formatDate(request.activation_sent_at)})`}
            </dd>
          </>
        )}
      </dl>

      {request.use_case && (
        <>
          <h3>What they want</h3>
          <p className="prewrap">{request.use_case}</p>
        </>
      )}

      {canTriage && (
        <label>
          Internal notes
          <textarea rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button
            type="button"
            className="secondary"
            disabled={busy || notes === (request.admin_notes ?? '')}
            onClick={() => run(() => accessRequestApi.saveNotes(id, notes), 'Notes saved.')}
          >
            Save notes
          </button>
        </label>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}

      <div className="actions">
        {canApprove && open && (
          <button type="button" disabled={busy} onClick={() => {
            if (window.confirm(`Create a workspace for ${request.email} and email them an activation link?`)) {
              void run(() => accessRequestApi.approve(id), 'Approved. The activation email has been sent.');
            }
          }}>
            Approve and provision
          </button>
        )}
        {canTriage && request.status === 'pending' && (
          <button type="button" className="secondary" disabled={busy} onClick={() => run(() => accessRequestApi.markContacted(id), 'Marked as contacted.')}>
            Mark contacted
          </button>
        )}
        {canTriage && open && !rejecting && (
          <button type="button" className="secondary danger" disabled={busy} onClick={() => setRejecting(true)}>Reject…</button>
        )}
        {canTriage && request.status === 'approved' && account && !account.activated && (
          <button type="button" className="secondary" disabled={busy} onClick={() => run(() => accessRequestApi.resendActivation(id), 'A new activation link has been sent.')}>
            Resend activation
          </button>
        )}
      </div>

      {rejecting && (
        <form
          className="reject"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => accessRequestApi.reject(id, reason, notify), 'Request rejected.').then(() => setRejecting(false));
          }}
        >
          <label>
            Reason <span className="muted small">(optional; included in the email if sent)</span>
            <textarea rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label className="inline">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email the requester
          </label>
          <div className="actions">
            <button type="submit" className="danger-solid" disabled={busy}>Confirm reject</button>
            <button type="button" className="link" onClick={() => setRejecting(false)}>Cancel</button>
          </div>
        </form>
      )}
    </aside>
  );
}
