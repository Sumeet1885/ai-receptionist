import { useCallback, useEffect, useState } from 'react';
import { Bell, Loader2, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { LIMITS, NOTIFICATION_EVENTS, validateNotificationRecipient } from '@ai-receptionist/contracts';
import { ApiError, notificationsApi, type NotificationRecipient, type NotificationRecipientInput } from '../api';
import { useToast } from '../toast';
import { ActiveBadge, Button, Card, Drawer, Field, INPUT, PageError, Toggle, cx } from '../ui';

const EMPTY: NotificationRecipientInput = { email: '', label: '', accessRequests: true, payments: true, signupLeads: true, isActive: true };

const toInput = (row: NotificationRecipient): NotificationRecipientInput => ({
  email: row.email,
  label: row.label ?? '',
  accessRequests: row.notify_access_requests,
  payments: row.notify_payments,
  signupLeads: row.notify_signup_leads,
  isActive: row.is_active,
});

function alertsOf(row: NotificationRecipient) {
  return [
    row.notify_access_requests && 'Access requests',
    row.notify_payments && 'Payments',
    row.notify_signup_leads && 'Signup leads',
  ].filter(Boolean) as string[];
}

export function Notifications({ roles }: { roles: string[] }) {
  const canEdit = roles.includes('super_admin');
  const toast = useToast();
  const [rows, setRows] = useState<NotificationRecipient[] | null>(null);
  const [fallback, setFallback] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ row: NotificationRecipient | null } | null>(null);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    notificationsApi.list()
      .then((data) => { setRows(data.recipients); setFallback(data.fallback); setError(''); })
      .catch((err) => setError((err as Error).message));
  }, []);
  useEffect(load, [load]);

  async function sendTest(row: NotificationRecipient) {
    setBusyId(row.id);
    try {
      const { delivered } = await notificationsApi.test(row.id);
      toast(delivered
        ? { tone: 'success', title: `Test sent to ${row.email}` }
        : { tone: 'info', title: 'Test not delivered', description: 'Email sending is not set up here, or SES refused it. Check the API logs.' });
    } catch (err) {
      toast({ tone: 'info', title: 'Test failed', description: (err as Error).message });
    } finally {
      setBusyId('');
    }
  }

  async function remove(row: NotificationRecipient) {
    if (!window.confirm(`Stop sending alerts to ${row.email}?`)) return;
    setBusyId(row.id);
    try {
      await notificationsApi.remove(row.id);
      toast({ tone: 'success', title: `${row.email} removed` });
      load();
    } catch (err) {
      toast({ tone: 'info', title: 'Could not remove', description: (err as Error).message });
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-subtle">Who gets an email when something needs attention. Each address can choose its alerts.</p>
        </div>
        {canEdit && <Button onClick={() => setEditing({ row: null })}><Plus className="h-4 w-4" /> Add emails</Button>}
      </div>

      <Card className="grid gap-3 p-5 sm:grid-cols-3">
        {Object.entries(NOTIFICATION_EVENTS).map(([key, label]) => (
          <div key={key} className="flex items-start gap-2.5 text-sm">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{label}</span>
          </div>
        ))}
      </Card>

      {error && <PageError message={error} onRetry={load} />}

      <Card className="overflow-hidden">
        {!rows && !error && <div className="flex h-40 items-center justify-center text-subtle"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {rows?.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Bell className="h-8 w-8 text-subtle" />
            <p className="font-semibold">No alert emails set up yet</p>
            <p className="max-w-md text-sm text-subtle">
              Until you add one, every alert goes to the super admins{fallback.length ? <>: <span className="font-medium text-ink">{fallback.join(', ')}</span></> : null}.
            </p>
          </div>
        )}
        {rows && rows.length > 0 && (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className={cx('flex flex-wrap items-center justify-between gap-3 px-5 py-4', !row.is_active && 'opacity-60')}>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {row.email} <ActiveBadge active={row.is_active} />
                  </p>
                  <p className="mt-0.5 text-xs text-subtle">
                    {row.label ? `${row.label} · ` : ''}{alertsOf(row).join(', ')}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="sm" disabled={busyId === row.id} onClick={() => sendTest(row)}><Send className="h-3.5 w-3.5" /> Send test</Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ row })}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                    <Button variant="ghost" size="sm" aria-label={`Remove ${row.email}`} disabled={busyId === row.id} onClick={() => remove(row)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <RecipientDrawer
          row={editing.row}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            load();
            toast({ tone: 'success', title: message });
          }}
        />
      )}
    </div>
  );
}

/** Addresses typed one per line or separated by commas, semicolons or spaces. */
const splitEmails = (text: string) => [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];

function RecipientDrawer({ row, onClose, onSaved }: { row: NotificationRecipient | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [form, setForm] = useState<NotificationRecipientInput>(row ? toInput(row) : EMPTY);
  // New recipients: several addresses at once, all with the same alerts.
  const [emailList, setEmailList] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof NotificationRecipientInput>(key: K, value: NotificationRecipientInput[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  async function save() {
    setError('');
    if (!row) return saveMany();
    const check = validateNotificationRecipient(form);
    if (!check.ok) {
      setErrors(check.errors);
      return setError('Please fix the highlighted fields.');
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await notificationsApi.update(row.id, form);
      onSaved(`${result.recipient.email} saved`);
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError) setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  }

  async function saveMany() {
    const emails = splitEmails(emailList);
    const { max } = LIMITS.recipientBatch;
    if (!emails.length) return setErrors({ email: 'Enter at least one email address.' });
    if (emails.length > max) return setErrors({ email: `Add at most ${max} addresses at a time.` });

    // Check every address and the shared settings before saving any.
    const checks = emails.map((email) => ({ email, check: validateNotificationRecipient({ ...form, email }) }));
    const invalid = checks.filter(({ check }) => 'errors' in check && check.errors.email).map(({ email }) => email);
    // Name and alert choices are the same for every address; take their messages from one check.
    const first = checks[0].check;
    const shared = 'errors' in first ? Object.fromEntries(Object.entries(first.errors).filter(([field]) => field !== 'email')) : {};
    if (invalid.length || Object.keys(shared).length) {
      setErrors({ ...shared, ...(invalid.length ? { email: `Not valid: ${invalid.join(', ')}` } : {}) });
      return setError('Please fix the highlighted fields.');
    }

    setErrors({});
    setBusy(true);
    const added: string[] = [];
    const skipped: string[] = [];
    try {
      for (const email of emails) {
        try {
          await notificationsApi.create({ ...form, email });
          added.push(email);
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) skipped.push(email);
          else throw err;
        }
      }
      onSaved(added.length
        ? `Added ${added.length} address${added.length === 1 ? '' : 'es'}${skipped.length ? ` (${skipped.length} already on the list)` : ''}`
        : 'Those addresses are already on the list');
    } catch (err) {
      setError(`${(err as Error).message}${added.length ? ` Added before the error: ${added.join(', ')}.` : ''}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={row ? `Edit ${row.email}` : 'Add alert emails'}
      subtitle="Alerts link straight to the right page in this console."
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
      </>}
    >
      {error && <p role="alert" className="rounded-xl bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      {row ? (
        <Field label="Email" error={errors.email}>
          <input className={INPUT} type="email" maxLength={LIMITS.email.max} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="sales@yourcompany.com" />
        </Field>
      ) : (
        <Field label="Emails" hint={`(one per line or comma-separated, up to ${LIMITS.recipientBatch.max})`} error={errors.email}>
          <textarea
            className={cx(INPUT, 'h-auto min-h-28 resize-y py-2')}
            rows={4}
            maxLength={(LIMITS.email.max + 2) * LIMITS.recipientBatch.max}
            value={emailList}
            onChange={(e) => setEmailList(e.target.value)}
            placeholder={'sales@yourcompany.com\nowner@yourcompany.com'}
          />
          <span className="block text-right text-[11px] text-subtle">{splitEmails(emailList).length} / {LIMITS.recipientBatch.max} addresses</span>
        </Field>
      )}
      <Field label="Name" hint={row ? '(optional, e.g. Sales team)' : '(optional, applied to all)'} error={errors.label}>
        <input className={INPUT} maxLength={LIMITS.recipientLabel.max} value={form.label} onChange={(e) => set('label', e.target.value)} />
      </Field>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink">Send these alerts</p>
        <Toggle checked={form.accessRequests} onChange={(v) => set('accessRequests', v)} label="Access requests" description={NOTIFICATION_EVENTS.access_requests} />
        <Toggle checked={form.payments} onChange={(v) => set('payments', v)} label="Payments" description={NOTIFICATION_EVENTS.payments} />
        <Toggle checked={form.signupLeads} onChange={(v) => set('signupLeads', v)} label="Signup leads" description={NOTIFICATION_EVENTS.signup_leads} />
        {errors.events && <p className="text-xs text-danger">{errors.events}</p>}
      </div>
      <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Active" description="Turn off to pause all alerts to this address." />
    </Drawer>
  );
}
