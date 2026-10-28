import { navigate } from '../router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react';
import {
  SALES_SUPPORT_CATEGORY,
  SUPPORT_FILE_ACCEPT,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  supportFileError,
  supportLabel,
  supportNumber,
  type SupportCategory,
  type SupportTicket,
} from '@ai-receptionist/contracts';
import { request } from '../api';
import { useLive } from '../live';
import { useToast } from '../toast';
import { Button, Card, Drawer, Field, INPUT, PageError, cx, formatDate, initials, timeAgo } from '../ui';

const TICKET_STATUS_STYLE = {
  open: 'bg-info-surface text-info',
  in_progress: 'bg-warning-surface text-warning',
  awaiting_reply: 'bg-primary-soft text-primary',
  resolved: 'bg-success-surface text-success',
  closed: 'bg-background text-subtle',
};
function TicketStatus({ status }: { status: SupportTicket['status'] }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        TICKET_STATUS_STYLE[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {supportLabel(status)}
    </span>
  );
}
function TicketPriority({ priority }: { priority: SupportTicket['priority'] }) {
  const style =
    priority === 'critical' ? 'text-danger' : priority === 'high' ? 'text-warning' : 'text-subtle';
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium', style)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {priority ? supportLabel(priority) : 'Not set'}
    </span>
  );
}

interface SettingsData {
  categories: SupportCategory[];
  retention_days: number;
}
export function Support({ roles }: { roles: string[] }) {
  const canEdit = roles.includes('support') || roles.includes('super_admin');
  const canConfigure = roles.includes('super_admin');
  const toast = useToast();
  const { version } = useLive();
  const [settings, setSettings] = useState<SettingsData>({ categories: [], retention_days: 0 });
  const [configOpen, setConfigOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [unread, setUnread] = useState(false);
  const [salesOnly, setSalesOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [selected, setSelected] = useState(
    () => new URLSearchParams(window.location.search).get('ticket') || '',
  );
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    if (selected) {
      const result = await request<{ ticket: SupportTicket }>(`/support/${selected}`);
      if (selectedRef.current === selected) setTicket(result.ticket);
    }
    {
      const result = await request<{ tickets: SupportTicket[]; total: number }>(
        `/support?${new URLSearchParams({ page: String(page), status, priority, search: applied, unread: String(unread), category: salesOnly ? SALES_SUPPORT_CATEGORY.id : '' })}`,
      );
      if (version === loadVersion.current) { setTickets(result.tickets); setTotal(result.total); }
    }
  }, [selected, page, status, priority, applied, unread, salesOnly]);
  useEffect(() => {
    void request<SettingsData>('/support/settings')
      .then(setSettings)
      .catch((err) => setError(err.message));
  }, []);
  useEffect(() => {
    setError('');
    void load().catch((err) => setError(err.message));
  }, [load, version]);
  useEffect(() => {
    const sync = () => {
      setSelected(new URLSearchParams(window.location.search).get('ticket') || '');
      setTicket(null);
      setBody('');
      setFiles([]);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const categoryName = (id: string) => settings.categories.find((c) => c.id === id)?.name || supportLabel(id);
  function choose(id: string) {
    setSelected(id);
    setTicket(null);
    setBody('');
    setFiles([]);
    setInternal(false);
    setError('');
    window.history.replaceState({}, '', `/super-admin/support${id ? `?ticket=${id}` : ''}`);
  }
  async function patch(changes: Record<string, unknown>) {
    if (!ticket || busy) return;
    setBusy(true);
    setError('');
    try {
      setTicket(
        (
          await request<{ ticket: SupportTicket }>(`/support/${ticket.id}`, {
            method: 'PATCH',
            body: changes,
          })
        ).ticket,
      );
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function reply(event: React.FormEvent) {
    event.preventDefault();
    if (!ticket || busy || !body.trim()) return;
    setBusy(true);
    setError('');
    try {
      const data = new FormData();
      data.set('body', body.trim());
      data.set('isInternal', String(internal));
      files.forEach((file) => data.append('files', file));
      setTicket(
        (
          await request<{ ticket: SupportTicket }>(`/support/${ticket.id}/messages`, {
            method: 'POST',
            body: data,
          })
        ).ticket,
      );
      setBody('');
      setFiles([]);
      toast({ tone: 'success', title: internal ? 'Internal note saved' : 'Reply sent' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function download(fileId: string) {
    try {
      const result = await request<{ url: string }>(`/support/${selected}/attachments/${fileId}`);
      window.location.assign(result.url);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="support-workspace space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Support tickets</h1>
          <p className="mt-1 text-sm text-subtle">
            Manage customer conversations and keep your team in the loop.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load().catch((err) => setError(err.message))}>
            <RefreshCw size={16} /> Refresh
          </Button>
          {canConfigure && <Button variant="secondary" onClick={() => navigate('notifications')}>Email recipients</Button>}
          {canConfigure && (
            <Button variant="secondary" onClick={() => setConfigOpen(true)}>
              <Settings size={16} /> Settings
            </Button>
          )}
        </div>
      </div>
      {error && !selected && (
        <PageError
          message={error}
          onRetry={() =>
            void load()
              .then(() => setError(''))
              .catch((err) => setError(err.message))
          }
        />
      )}
      <div className="space-y-5">
        <Card className="overflow-hidden">
          <div className="border-b border-line px-4 pt-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Ticket inbox</h2>
                <span
                  className="rounded-md bg-background px-2 py-0.5 text-xs font-semibold text-subtle"
                  aria-live="polite"
                >
                  {tickets ? total : '...'}
                </span>
              </div>
              <button type="button" aria-pressed={salesOnly} className={cx('rounded-lg border px-3 py-1.5 text-xs font-semibold', salesOnly ? 'border-warning/30 bg-warning-surface text-warning' : 'border-line text-subtle')} onClick={() => { setSalesOnly(!salesOnly); setPage(1); }}>Pricing &amp; sales only</button>
              {(status || priority || unread || applied || salesOnly) && (
                <button
                  type="button"
                  className="text-xs font-semibold text-primary hover:underline"
                  onClick={() => {
                    setSalesOnly(false);
                    setStatus('');
                    setPriority('');
                    setUnread(false);
                    setSearch('');
                    setApplied('');
                    setPage(1);
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-x-1 gap-y-1" role="group" aria-label="Filter ticket status">
              {[
                { value: '', label: 'All tickets' },
                ...SUPPORT_STATUSES.map((value) => ({ value, label: supportLabel(value) })),
              ].map((item) => (
                <button
                  type="button"
                  key={item.value}
                  aria-pressed={status === item.value}
                  onClick={() => {
                    setStatus(item.value);
                    setPage(1);
                  }}
                  className={cx(
                    'relative rounded-t-lg px-3 py-3 text-sm font-medium transition-colors',
                    status === item.value
                      ? 'bg-primary-soft text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
                      : 'text-subtle hover:bg-background hover:text-ink',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="support-ticket-toolbar border-b border-line bg-background/40 p-4 sm:px-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setApplied(search.trim());
                setPage(1);
              }}
              className="support-ticket-search flex min-w-0 gap-2"
              role="search"
            >
              <div className="relative min-w-0 flex-1">
                <Search
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-3 text-subtle"
                />
                <input
                  type="search"
                  aria-label="Search support tickets"
                  placeholder="Search subject or email"
                  maxLength={100}
                  className={cx(INPUT, 'support-search-input')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </form>
            <select
              aria-label="Filter priority"
              className={cx(INPUT, 'support-priority-filter')}
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All priorities</option>
              {SUPPORT_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {supportLabel(value)}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={unread}
              onClick={() => {
                setUnread(!unread);
                setPage(1);
              }}
              className={cx(
                'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3 text-sm font-medium transition-colors',
                unread
                  ? 'border-primary/30 bg-primary-soft text-primary'
                  : 'border-line bg-surface text-subtle hover:border-primary/40',
              )}
            >
              <span className={cx('h-2 w-2 rounded-full', unread ? 'bg-primary' : 'bg-orange')} />
              Unread only
            </button>
          </div>
          <table className="support-ticket-table w-full table-fixed text-left text-sm">
            <colgroup>
              <col style={{ width: '34%' }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '13%' }} />
            </colgroup>
            <thead className="bg-background/50">
              <tr className="border-b border-line text-xs text-subtle">
                {['Ticket', 'Requester', 'Status', 'Priority', 'Updated'].map((label) => (
                  <th key={label} className="px-4 py-3 font-medium first:pl-5 last:pr-5">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets?.map((item) => (
                <tr
                  key={item.id}
                  className={cx('group cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-background/80', item.category === SALES_SUPPORT_CATEGORY.id && 'bg-warning-surface/50')}
                  onClick={() => choose(item.id)}
                >
                  <td className="py-4 pl-5 pr-4">
                    <button type="button" className="block w-full min-w-0 text-left">
                      <span className="flex items-center gap-2 text-xs text-subtle">
                        {supportNumber(item.ticket_number)}{item.category === SALES_SUPPORT_CATEGORY.id && <span className="rounded bg-warning-surface px-1.5 py-0.5 text-[10px] font-semibold text-warning">Sales</span>}
                        {item.admin_unread && (
                          <span className="rounded bg-orange/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                            Unread
                          </span>
                        )}
                      </span>
                      <span
                        className={cx(
                          'mt-1.5 block line-clamp-2 break-words leading-5 group-hover:text-primary',
                          item.admin_unread ? 'font-semibold' : 'font-medium',
                        )}
                      >
                        {item.subject}
                      </span>
                      <span className="mt-1 block text-xs text-subtle">{categoryName(item.category)}</span>
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <span className="block truncate font-medium" title={item.name}>
                      {item.name || 'Customer'}
                    </span>
                    <span className="mt-1 block truncate text-xs text-subtle" title={item.email}>
                      {item.email}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <TicketStatus status={item.status} />
                  </td>
                  <td className="px-4 py-4">
                    <TicketPriority priority={item.priority} />
                  </td>
                  <td className="py-4 pl-4 pr-5">
                    <span
                      className="whitespace-nowrap text-xs text-subtle"
                      title={formatDate(item.updated_at)}
                    >
                      {timeAgo(item.updated_at)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="support-ticket-cards divide-y divide-line">
            {tickets?.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => choose(item.id)}
                className={cx('block w-full px-4 py-4 text-left transition-colors hover:bg-background sm:px-5', item.category === SALES_SUPPORT_CATEGORY.id && 'bg-warning-surface/50')}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs text-subtle">
                    {item.admin_unread && (
                      <span className="h-2 w-2 rounded-full bg-orange" aria-label="Unread" />
                    )}
                    {supportNumber(item.ticket_number)}{item.category === SALES_SUPPORT_CATEGORY.id && <span className="rounded bg-warning-surface px-1.5 py-0.5 text-[10px] font-semibold text-warning">Sales</span>}
                  </span>
                  <TicketStatus status={item.status} />
                </span>
                <span className="mt-2 block line-clamp-2 break-words text-sm font-semibold leading-5">
                  {item.subject}
                </span>
                <span className="mt-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                    {initials(item.name || 'Customer')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{item.name || 'Customer'}</span>
                    <span className="block truncate text-xs text-subtle">{item.email}</span>
                  </span>
                  <ArrowUpRight size={16} className="shrink-0 text-subtle" aria-hidden="true" />
                </span>
                <span className="mt-3 flex items-center justify-between gap-2">
                  <TicketPriority priority={item.priority} />
                  <span className="text-xs text-subtle" title={formatDate(item.updated_at)}>
                    {timeAgo(item.updated_at)}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {(!tickets || !tickets.length) && (
            <div className="px-5 py-12 text-center" role="status">
              <Inbox size={28} className="mx-auto mb-3 text-subtle/60" />
              <p className="text-sm font-semibold">
                {tickets ? 'No tickets match your filters' : 'Loading tickets...'}
              </p>
              {tickets && (
                <p className="mt-1 text-sm text-subtle">Try a different search or clear your filters.</p>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
            <p className="text-xs text-subtle" aria-live="polite">
              {total
                ? `${(page - 1) * 25 + 1}-${Math.min(page * 25, total)} of ${total} ${total === 1 ? 'ticket' : 'tickets'}`
                : '0 tickets'}
            </p>
            <div className="flex items-center gap-2">
              <span className="mr-1 text-xs text-subtle">Page {page}</span>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Previous page"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={15} />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Next page"
                disabled={page * 25 >= total}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        </Card>
        {selected && (
          <Drawer
            title={ticket?.category === SALES_SUPPORT_CATEGORY.id ? 'Sales enquiry details' : 'Support ticket details'}
            subtitle={ticket ? supportNumber(ticket.ticket_number) : 'Loading ticket...'}
            onClose={() => choose('')}
            footer={
              <Button variant="secondary" onClick={() => choose('')}>
                Close
              </Button>
            }
          >
            {error && (
              <PageError
                message={error}
                onRetry={() =>
                  void load()
                    .then(() => setError(''))
                    .catch((err) => setError(err.message))
                }
              />
            )}
            {ticket ? (
              <>
                <Card className="space-y-4 p-5">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <p className="text-sm text-subtle">
                        {supportNumber(ticket.ticket_number)} · {formatDate(ticket.created_at)}
                      </p>
                      <h2 className="mt-1 break-words font-display text-xl font-bold">{ticket.subject}</h2>
                    </div>
                    <span className="self-start rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary">
                      {supportLabel(ticket.status)}
                    </span>
                  </div>
                  <div className="grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-3">
                    <div>
                      <p className="font-semibold">{ticket.name}</p>
                      <p className="break-all text-subtle">{ticket.email}</p>
                      <p className="text-subtle">{ticket.phone}</p>
                    </div>
                    <div>
                      <p className="text-subtle">Category</p>
                      <p>{categoryName(ticket.category)}</p>
                    </div>
                    <div>
                      <p className="text-subtle">Last updated</p>
                      <p>{formatDate(ticket.updated_at)}</p>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
                      <Field label="Status">
                        <select
                          className={INPUT}
                          value={ticket.status}
                          disabled={busy}
                          onChange={(e) => void patch({ status: e.target.value })}
                        >
                          {SUPPORT_STATUSES.map((value) => (
                            <option key={value} value={value}>
                              {supportLabel(value)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Priority">
                        <select
                          className={INPUT}
                          value={ticket.priority}
                          disabled={busy}
                          onChange={(e) => void patch({ priority: e.target.value })}
                        >
                          {SUPPORT_PRIORITIES.map((value) => (
                            <option key={value} value={value}>
                              {supportLabel(value)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Category">
                        <select
                          className={INPUT}
                          value={ticket.category}
                          disabled={busy || ticket.category === SALES_SUPPORT_CATEGORY.id}
                          onChange={(e) => void patch({ category: e.target.value })}
                        >
                          {settings.categories
                            .filter((c) => !c.archived || c.id === ticket.category)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void patch({ admin_unread: !ticket.admin_unread })}
                      >
                        {ticket.admin_unread ? 'Mark read' : 'Mark unread'}
                      </Button>
                    </div>
                  )}
                </Card>
                <div className="space-y-4">
                  {ticket.messages?.map((message) => (
                    <Card
                      key={message.id}
                      className={cx('p-5', message.is_internal && 'border-warning/30 bg-warning-surface')}
                    >
                      <div className="flex flex-wrap justify-between gap-2 text-sm">
                        <strong>
                          {message.sender_name}{' '}
                          {message.is_internal
                            ? '· Internal note'
                            : message.sender_type === 'admin'
                              ? '· Support'
                              : '· Customer'}
                        </strong>
                        <span className="text-subtle">{formatDate(message.created_at)}</span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {message.body}
                      </p>
                      {message.attachments.map((file) => (
                        <button
                          type="button"
                          key={file.id}
                          onClick={() => void download(file.id)}
                          className="mt-3 flex items-center gap-2 text-sm text-primary underline"
                        >
                          <Paperclip size={16} />
                          <span className="break-all">{file.file_name}</span>
                        </button>
                      ))}
                    </Card>
                  ))}
                </div>
                {canEdit && (
                  <Card className="p-5">
                    <form onSubmit={reply} className="space-y-4">
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={internal}
                          onChange={(e) => setInternal(e.target.checked)}
                          disabled={busy}
                        />{' '}
                        Internal note (hidden from customer)
                      </label>
                      <textarea
                        aria-label={internal ? 'Internal note' : 'Reply to customer'}
                        className={cx(INPUT, 'h-auto py-3')}
                        maxLength={5000}
                        required
                        rows={5}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        disabled={busy}
                      />
                      <input
                        key={ticket.messages?.length}
                        type="file"
                        aria-label="Reply attachments"
                        accept={SUPPORT_FILE_ACCEPT}
                        multiple
                        disabled={busy}
                        className="block w-full text-sm"
                        onChange={(e) => {
                          const selectedFiles = Array.from(e.target.files || []);
                          const issue = supportFileError(selectedFiles, false);
                          setError(issue);
                          setFiles(issue ? [] : selectedFiles);
                        }}
                      />
                      <p className="text-xs text-subtle">
                        Up to 3 static images (JPG, PNG, WEBP) or PDF files, 10 MB each.
                      </p>
                      <Button type="submit" disabled={busy || !body.trim()}>
                        {busy && <Loader2 size={16} className="animate-spin" />}
                        {internal ? 'Save internal note' : 'Send reply'}
                      </Button>
                    </form>
                  </Card>
                )}
              </>
            ) : (
              <p className="py-10 text-center text-subtle">Loading ticket...</p>
            )}
          </Drawer>
        )}
      </div>
      {configOpen && (
        <SupportSettings
          value={settings}
          onClose={() => setConfigOpen(false)}
          onSaved={(value) => {
            setSettings(value);
            setConfigOpen(false);
            toast({ tone: 'success', title: 'Support settings saved' });
          }}
        />
      )}
    </div>
  );
}

function SupportSettings({
  value,
  onClose,
  onSaved,
}: {
  value: SettingsData;
  onClose: () => void;
  onSaved: (value: SettingsData) => void;
}) {
  const [form, setForm] = useState(value);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError('');
    try {
      onSaved(await request<SettingsData>('/support/settings', { method: 'PUT', body: form }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      title="Support settings"
      subtitle="Manage categories, default priority and optional retention for finished tickets."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            Save settings
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="space-y-4">
        {form.categories.map((category, index) => {
          const update = (patch: Partial<SupportCategory>) =>
            setForm((prev) => ({
              ...prev,
              categories: prev.categories.map((c, i) => (i === index ? { ...c, ...patch } : c)),
            }));
          return (
            <div key={index} className="space-y-3 rounded-xl border border-line p-4">
              <Field label="Category ID">
                <input
                  className={INPUT}
                  value={category.id}
                  maxLength={50}
                  disabled={value.categories.some((c) => c.id === category.id)}
                  onChange={(e) => update({ id: e.target.value })}
                />
              </Field>
              <Field label="Name">
                <input
                  className={INPUT}
                  value={category.name}
                  disabled={category.id === SALES_SUPPORT_CATEGORY.id}
                  maxLength={60}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </Field>
              <Field label="Default priority">
                <select
                  className={INPUT}
                  value={category.defaultPriority}
                  disabled={category.id === SALES_SUPPORT_CATEGORY.id}
                  onChange={(e) =>
                    update({ defaultPriority: e.target.value as SupportCategory['defaultPriority'] })
                  }
                >
                  {SUPPORT_PRIORITIES.map((v) => (
                    <option key={v} value={v}>
                      {supportLabel(v)}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!category.archived}
                  disabled={category.id === SALES_SUPPORT_CATEGORY.id}
                  onChange={(e) => update({ archived: e.target.checked })}
                />{' '}
                Archived (hidden from new tickets)
              </label>
            </div>
          );
        })}
      </div>
      <Button
        variant="secondary"
        disabled={form.categories.length >= 31}
        onClick={() =>
          setForm((prev) => ({
            ...prev,
            categories: [
              ...prev.categories,
              { id: `category_${Date.now()}`, name: '', defaultPriority: 'medium' },
            ],
          }))
        }
      >
        <Plus size={16} /> Add category
      </Button>
      <Field
        label="Delete finished tickets after (days)"
        hint="0 disables automatic deletion; otherwise 1–3650 days after the last update. Attachments are deleted too."
      >
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          className={INPUT}
          value={form.retention_days}
          onChange={(e) => setForm((prev) => ({ ...prev, retention_days: Number(e.target.value) }))}
        />
      </Field>
    </Drawer>
  );
}
