import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, Plus, RefreshCw, Settings } from 'lucide-react';
import {
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
import { Button, Card, Drawer, Field, INPUT, PageError, cx, formatDate } from '../ui';

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

  const load = useCallback(async () => {
    if (selected) {
      const result = await request<{ ticket: SupportTicket }>(`/support/${selected}`);
      if (selectedRef.current === selected) setTicket(result.ticket);
    }
    {
      const result = await request<{ tickets: SupportTicket[]; total: number }>(
        `/support?${new URLSearchParams({ page: String(page), status, priority, search: applied, unread: String(unread) })}`,
      );
      setTickets(result.tickets);
      setTotal(result.total);
    }
  }, [selected, page, status, priority, applied, unread]);
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Support tickets</h1>
          <p className="mt-1 text-sm text-subtle">
            Review customer questions, reply privately, and keep internal notes for your team.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load().catch((err) => setError(err.message))}>
            <RefreshCw size={16} /> Refresh
          </Button>
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
      <div
        className="space-y-5"
      >
        <div className="min-w-0 space-y-4">
          <>
            <div className="flex flex-wrap gap-3">
              <select
                aria-label="Filter status"
                className={cx(INPUT, 'w-auto')}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {SUPPORT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {supportLabel(value)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter priority"
                className={cx(INPUT, 'w-auto')}
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
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={unread}
                  onChange={(e) => {
                    setUnread(e.target.checked);
                    setPage(1);
                  }}
                />{' '}
                Unread only
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setApplied(search);
                  setPage(1);
                }}
                className="flex flex-1 gap-2"
              >
                <input
                  type="search"
                  aria-label="Search support tickets"
                  placeholder="Search subject or email"
                  maxLength={100}
                  className={INPUT}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button type="submit" variant="secondary">
                  Search
                </Button>
              </form>
            </div>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-subtle">
                    {['Ticket', 'Requester', 'Status', 'Priority', 'Updated'].map((label) => (
                      <th key={label} className="px-4 py-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tickets?.map((item) => (
                    <tr key={item.id} className="border-b border-line last:border-0 hover:bg-background">
                      <td className="max-w-xs px-4 py-4">
                        <button className="text-left" type="button" onClick={() => choose(item.id)}>
                          <span className="text-xs text-subtle">
                            {item.admin_unread && (
                              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-orange" />
                            )}
                            {supportNumber(item.ticket_number)}
                          </span>
                          <p className={cx('mt-1 break-words', item.admin_unread && 'font-bold')}>
                            {item.subject}
                          </p>
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <p>{item.name}</p>
                        <p className="text-xs text-subtle">{item.email}</p>
                      </td>
                      <td className="px-4 py-4">{supportLabel(item.status)}</td>
                      <td className="px-4 py-4">{supportLabel(item.priority || '')}</td>
                      <td className="px-4 py-4 text-subtle">{formatDate(item.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!tickets || !tickets.length) && (
                <p className="p-8 text-center text-subtle">
                  {tickets ? 'No tickets match these filters.' : 'Loading tickets...'}
                </p>
              )}
            </Card>
            <div className="flex items-center justify-between">
              <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-sm text-subtle">
                {total} tickets · Page {page}
              </span>
              <Button variant="secondary" disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </>
        </div>
        {selected && (
          <Drawer
            title="Support ticket details"
            subtitle={ticket ? supportNumber(ticket.ticket_number) : 'Loading ticket...'}
            onClose={() => choose('')}
            footer={<Button variant="secondary" onClick={() => choose('')}>Close</Button>}
          >
            {error && <PageError message={error} onRetry={() => void load().then(() => setError('')).catch((err) => setError(err.message))} />}
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
                          disabled={busy}
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
                  maxLength={60}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </Field>
              <Field label="Default priority">
                <select
                  className={INPUT}
                  value={category.defaultPriority}
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
        disabled={form.categories.length >= 30}
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
