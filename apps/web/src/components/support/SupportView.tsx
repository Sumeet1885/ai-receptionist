import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, LifeBuoy, Loader2, Paperclip, Plus } from 'lucide-react';
import {
  SUPPORT_LIMITS,
  supportLabel,
  supportNumber,
  validateSupport,
  type SupportCategory,
  type SupportInput,
  type SupportTicket,
} from '@ai-receptionist/contracts';
import { Button } from '../ui/button';
import { Input, Label, Textarea } from '../ui/field';
import { PhoneField } from '../ui/phone-field';
import { Honeypot } from '../security/Honeypot';
import { Turnstile } from '../security/Turnstile';
import { usePublicFormGuard } from '../../lib/publicForm';
import { supportDetail, supportRequest } from '../../lib/supportApi';
import { AttachmentPicker } from './AttachmentPicker';

const EMPTY: SupportInput = {
  name: '',
  email: '',
  phone: '',
  subject: '',
  category: 'general',
  description: '',
};
const SELECT = 'min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base';
const date = (value: string) =>
  new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-1 text-danger">
      *
    </span>
  );
}
function Count({ value, max }: { value: string; max: number }) {
  return (
    <span aria-hidden="true" className="ml-2 shrink-0 text-xs font-normal tabular-nums text-text-subtle">
      {value.length}/{max}
    </span>
  );
}

export function SupportView({
  mode,
  navigate,
  embedded = false,
  initialCreate,
  initialTicketId,
  guestToken,
  onDone,
}: {
  mode: 'customer' | 'guest' | 'guest-ticket';
  navigate: (path: string) => void;
  embedded?: boolean;
  initialCreate?: boolean;
  initialTicketId?: string;
  guestToken?: string;
  onDone?: () => void;
}) {
  const [categories, setCategories] = useState<SupportCategory[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [selected, setSelected] = useState(
    () => initialTicketId ?? new URLSearchParams(window.location.search).get('ticket') ?? '',
  );
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [privateToken] = useState(
    () => guestToken ?? new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
  );
  const [creating, setCreating] = useState(initialCreate ?? mode === 'guest');
  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState<{ number: string; emailSent: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const guard = usePublicFormGuard();
  const guest = mode !== 'customer';
  const token = mode === 'guest-ticket' ? privateToken : undefined;
  const load = useCallback(async () => {
    if (mode === 'guest') return;
    if (mode === 'guest-ticket' || selected) {
      const result = await supportDetail(selected, token);
      if (selectedRef.current === selected) setTicket(result.ticket);
    } else {
      const result = await supportRequest<{ tickets: SupportTicket[]; total: number }>(`?page=${page}`);
      if (!selectedRef.current) {
        setTickets(result.tickets);
        setTotal(result.total);
        setTicket(null);
      }
    }
  }, [mode, selected, token, page]);

  useEffect(() => {
    let stopped = false;
    supportRequest<{ categories: SupportCategory[] }>('/categories', undefined, '')
      .then((result) => {
        if (!stopped) {
          setCategories(result.categories);
          setForm((current) =>
            result.categories.some((c) => c.id === current.category)
              ? current
              : { ...current, category: result.categories[0]?.id || '' },
          );
        }
      })
      .catch((err) => {
        if (!stopped) setError(err.message);
      });
    return () => {
      stopped = true;
    };
  }, []);
  useEffect(() => {
    setLoading(true);
    setError('');
    setTicket(null);
    void load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(() => {
    if (creating || mode === 'guest') return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void load().catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load, creating, mode]);

  const set = (key: keyof SupportInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({
      ...prev,
      [key]: prev[key] ? validateSupport({ ...form, [key]: value }, guest).errors[key] || '' : '',
    }));
  };
  const checkField = (key: keyof SupportInput) => {
    const issue = validateSupport(form, guest).errors[key] || '';
    setErrors((prev) => ({ ...prev, [key]: issue }));
  };
  const fieldProps = (key: keyof SupportInput) => ({
    onBlur: () => checkField(key),
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': errors[key] ? `support-${key}-error` : undefined,
  });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    const payload = new FormData();
    if (creating) {
      const result = validateSupport(form, guest);
      if (!categories.some((category) => category.id === result.value.category))
        result.errors.category = 'Choose an available category.';
      if (!result.ok || Object.keys(result.errors).length) {
        setErrors(result.errors);
        document.getElementById(`support-${Object.keys(result.errors)[0]}`)?.focus();
        return;
      }
      if (guest && !guard.captchaReady) {
        setError('Complete the security check.');
        return;
      }
      for (const [key, value] of Object.entries(result.value)) payload.set(key, value);
      if (guest)
        for (const [key, value] of Object.entries(guard.guardFields())) payload.set(key, String(value));
    } else {
      if (!body.trim() || body.trim().length > 5000) {
        setError('Enter a reply between 1 and 5,000 characters.');
        return;
      }
      payload.set('body', body.trim());
    }
    for (const file of files) payload.append('files', file);
    setBusy(true);
    try {
      if (creating) {
        const result = await supportRequest<{
          ticketNumber?: string;
          ticket?: SupportTicket;
          emailSent: boolean;
        }>('', payload, guest ? '' : undefined);
        if (guest) setConfirmation({ number: result.ticketNumber!, emailSent: result.emailSent });
        else {
          setSelected(result.ticket!.id);
          setCreating(false);
          setForm(EMPTY);
        }
      } else {
        const result = await supportRequest<{ ticket: SupportTicket }>(
          guest ? '/ticket/messages' : `/${ticket!.id}/messages`,
          payload,
          token,
        );
        setTicket(result.ticket);
        setBody('');
      }
      setFiles([]);
    } catch (err: any) {
      setError(err.message);
      setErrors(err.fields || {});
    } finally {
      setBusy(false);
      if (guest && creating) guard.resetChallenge();
    }
  }
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name || supportLabel(id);
  async function download(fileId: string) {
    try {
      const result = await supportRequest<{ url: string }>(
        guest ? `/ticket/attachments/${fileId}` : `/${ticket!.id}/attachments/${fileId}`,
        undefined,
        token,
      );
      window.location.assign(result.url);
    } catch (err: any) {
      setError(err.message);
    }
  }
  async function changeStatus() {
    if (!ticket) return;
    setBusy(true);
    setError('');
    try {
      await supportRequest(`/${ticket.id}/status`, {
        status: ticket.status === 'closed' || ticket.status === 'resolved' ? 'open' : 'closed',
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={embedded ? 'w-full px-5 py-4' : 'mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12'}>
      {(!embedded || !creating) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
              <LifeBuoy size={18} /> Customer support
            </div>
            <h1
              className={
                embedded
                  ? 'font-display text-xl font-semibold tracking-tight'
                  : 'font-display text-3xl font-semibold tracking-tight'
              }
            >
              {creating
                ? 'How can we help?'
                : ticket
                  ? supportNumber(ticket.ticket_number)
                  : 'Your support tickets'}
            </h1>
            <p className="mt-2 text-base text-text-subtle">
              {creating
                ? 'Tell us what happened. Our team will follow up in your private ticket.'
                : 'Keep your questions and replies in one place.'}
            </p>
          </div>
          {mode === 'customer' && !creating && !ticket && (
            <Button
              onClick={() => {
                setCreating(true);
                setFiles([]);
                setError('');
              }}
            >
              <Plus size={18} /> New ticket
            </Button>
          )}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-danger/20 bg-danger-surface p-4 text-sm text-danger"
        >
          {error}{' '}
          {!creating && (
            <button
              type="button"
              onClick={() =>
                void load()
                  .then(() => setError(''))
                  .catch((err) => setError(err.message))
              }
              className="ml-2 underline"
            >
              Try again
            </button>
          )}
        </div>
      )}
      {confirmation ? (
        <div className="rounded-2xl border border-border bg-surface p-6">
          <CheckCircle2 className="mb-3 text-success" />
          <h2 className="text-xl font-semibold">Request received: {confirmation.number}</h2>
          <p className="mt-3 text-text-subtle">
            {confirmation.emailSent
              ? 'Check your email for a private link to view this ticket and reply. Keep the link private.'
              : 'Your ticket was saved, but the confirmation email could not be sent. Keep this ticket number and contact our team if you need to follow up.'}
          </p>
          <Button className="mt-4" onClick={() => (onDone ? onDone() : navigate('/'))}>
            {embedded ? 'Done' : 'Back to home'}
          </Button>
        </div>
      ) : creating ? (
        <form
          onSubmit={submit}
          noValidate
          className={
            embedded ? 'space-y-3' : 'space-y-5 rounded-2xl border border-border bg-surface p-5 sm:p-7'
          }
          aria-busy={busy}
        >
          <p className="text-xs text-text-subtle">
            <span className="text-danger">*</span> Required fields
          </p>
          {guest && <Honeypot {...guard.honeypotProps} />}
          <fieldset disabled={busy} className={embedded ? 'min-w-0 space-y-3' : 'min-w-0 space-y-5'}>
            {guest && (
              <div className="grid gap-3 sm:grid-cols-2">
                {(['name', 'email'] as const).map((key) => (
                  <div key={key}>
                    <Label htmlFor={`support-${key}`} className="flex items-center justify-between">
                      <span>
                        {key === 'name' ? 'Full name' : 'Email address'}
                        <RequiredMark />
                      </span>
                      <Count value={form[key]} max={SUPPORT_LIMITS[key].max} />
                    </Label>
                    <Input
                      id={`support-${key}`}
                      type={key === 'email' ? 'email' : 'text'}
                      autoComplete={key}
                      required
                      minLength={key === 'name' ? SUPPORT_LIMITS.name.min : undefined}
                      maxLength={SUPPORT_LIMITS[key].max}
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                      {...fieldProps(key)}
                    />
                    {errors[key] && (
                      <p id={`support-${key}-error`} className="mt-1 text-sm text-danger">
                        {errors[key]}
                      </p>
                    )}
                  </div>
                ))}
                <div>
                  <Label htmlFor="support-phone">
                    Phone number
                    <RequiredMark />
                  </Label>
                  <PhoneField
                    id="support-phone"
                    required
                    value={form.phone}
                    onChange={(value) => set('phone', value.slice(0, SUPPORT_LIMITS.phone.max))}
                    {...fieldProps('phone')}
                  />
                  {errors.phone && (
                    <p id="support-phone-error" className="mt-1 text-sm text-danger">
                      {errors.phone}
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="support-category">
                  Category
                  <RequiredMark />
                </Label>
                <select
                  id="support-category"
                  required
                  {...fieldProps('category')}
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                  className={SELECT}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {errors.category && (
                  <p id="support-category-error" className="mt-1 text-sm text-danger">
                    {errors.category}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="support-subject" className="flex items-center justify-between">
                  <span>
                    Subject <span className="font-normal text-text-subtle">(optional)</span>
                  </span>
                  <Count value={form.subject} max={SUPPORT_LIMITS.subject.max} />
                </Label>
                <Input
                  id="support-subject"
                  value={form.subject}
                  onChange={(e) => set('subject', e.target.value)}
                  maxLength={SUPPORT_LIMITS.subject.max}
                  {...fieldProps('subject')}
                />
                {errors.subject && (
                  <p id="support-subject-error" className="mt-1 text-sm text-danger">
                    {errors.subject}
                  </p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="support-description">
                What do you need help with?
                <RequiredMark />
              </Label>
              <Textarea
                id="support-description"
                rows={embedded ? 3 : 6}
                minLength={SUPPORT_LIMITS.description.min}
                maxLength={SUPPORT_LIMITS.description.max}
                required
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                {...fieldProps('description')}
              />
              <div className="mt-1 flex justify-between gap-3 text-sm text-text-subtle">
                <span id="support-description-error" className={errors.description ? 'text-danger' : ''}>
                  {errors.description || '10?5,000 characters. Leave out passwords and secret keys.'}
                </span>
                <Count value={form.description} max={SUPPORT_LIMITS.description.max} />
              </div>
            </div>
            <div>
              <Label htmlFor="support-file">Attachment (optional)</Label>
              <AttachmentPicker
                id="support-file"
                files={files}
                onChange={setFiles}
                onError={setError}
                creating
                disabled={busy}
              />
            </div>
          </fieldset>
          {guest && <Turnstile {...guard.turnstileProps} />}
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface py-3">
            {mode === 'customer' ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setCreating(false);
                  setFiles([]);
                  setError('');
                }}
              >
                Cancel
              </Button>
            ) : (
              <span className="text-sm text-text-subtle">Your ticket link is sent to your email.</span>
            )}
            <Button type="submit" disabled={busy || (guest && !guard.captchaReady) || !categories.length}>
              {busy && <Loader2 size={16} className="animate-spin" />} Send support request
            </Button>
          </div>
        </form>
      ) : loading ? (
        <p role="status" className="py-12 text-center text-text-subtle">
          Loading support...
        </p>
      ) : ticket ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {mode === 'customer' && (
              <button
                type="button"
                className="flex min-h-11 items-center gap-2 text-primary"
                onClick={() => {
                  setSelected('');
                  setFiles([]);
                  setBody('');
                  setError('');
                  if (!embedded) window.history.replaceState({}, '', '/support');
                }}
              >
                <ArrowLeft size={18} /> All tickets
              </button>
            )}
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              {supportLabel(ticket.status)}
            </span>
            {mode === 'customer' && (
              <Button variant="secondary" disabled={busy} onClick={() => void changeStatus()}>
                {['closed', 'resolved'].includes(ticket.status) ? 'Reopen ticket' : 'Close ticket'}
              </Button>
            )}
          </div>
          <div>
            <h2 className="break-words text-xl font-semibold">{ticket.subject}</h2>
            <p className="mt-1 text-sm text-text-subtle">
              {categoryName(ticket.category)} · Opened {date(ticket.created_at)}
            </p>
          </div>
          <div className="space-y-4">
            {ticket.messages?.map((message) => (
              <article
                key={message.id}
                className={`rounded-xl border border-border p-5 ${message.sender_type === 'admin' ? 'bg-primary/5' : 'bg-surface'}`}
              >
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <strong>{message.sender_type === 'admin' ? 'Support team' : 'You'}</strong>
                  <time className="text-text-subtle">{date(message.created_at)}</time>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
                {message.attachments.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => void download(file.id)}
                    className="mt-3 flex max-w-full items-center gap-2 text-left text-sm text-primary underline"
                  >
                    <Paperclip size={16} className="shrink-0" />
                    <span className="break-all">{file.file_name}</span>
                  </button>
                ))}
              </article>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-surface p-5">
            <Label htmlFor="support-reply" className="flex items-center justify-between">
              <span>
                Reply to support
                <RequiredMark />
              </span>
              <Count value={body} max={SUPPORT_LIMITS.reply.max} />
            </Label>
            <Textarea
              id="support-reply"
              required
              minLength={SUPPORT_LIMITS.reply.min}
              maxLength={SUPPORT_LIMITS.reply.max}
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={busy}
            />
            <p className="text-sm text-text-subtle">Replying reopens a resolved or closed ticket.</p>
            <AttachmentPicker
              id="support-reply-files"
              files={files}
              onChange={setFiles}
              onError={setError}
              creating={false}
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !body.trim()}>
              {busy && <Loader2 size={16} className="animate-spin" />} Send reply
            </Button>
          </form>
        </div>
      ) : mode === 'customer' ? (
        <>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {tickets.length ? (
              tickets.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setSelected(item.id);
                    setFiles([]);
                  }}
                  className="flex w-full flex-wrap justify-between gap-3 p-5 text-left hover:bg-background"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text-subtle">
                      {supportNumber(item.ticket_number)} · {categoryName(item.category)}
                    </p>
                    <p className="mt-1 break-words font-semibold">{item.subject}</p>
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold text-primary">{supportLabel(item.status)}</p>
                    <p className="mt-1 text-text-subtle">{date(item.updated_at)}</p>
                  </div>
                </button>
              ))
            ) : (
              <p className="p-8 text-center text-text-subtle">
                No support tickets yet. Create one whenever you need help.
              </p>
            )}
          </div>
          <div className="mt-4 flex justify-between">
            <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="self-center text-sm">Page {page}</span>
            <Button variant="secondary" disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
