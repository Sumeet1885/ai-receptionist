import { useEffect, useState } from 'react';
import { Loader2, Mail, Phone, Send, UserPlus } from 'lucide-react';
import {
  billingAdminApi,
  formatMoney,
  type BillingOrder,
  type LeadStage,
  type LeadEmailPreview,
} from '../api';
import { useToast } from '../toast';
import { useLive } from '../live';
import { Button, Card, Drawer, FilterTabs, PageError, Pager, cx, formatDate, timeAgo } from '../ui';

// Unpaid checkouts: people who chose a plan and entered their details but did not pay. Once a lead
// pays it moves to Revenue.

const TABS: Array<{ value: LeadStage | undefined; label: string }> = [
  { value: undefined, label: 'All unpaid' },
  { value: 'closed', label: 'Checkout closed' },
  { value: 'failed', label: 'Payment failed' },
  { value: 'started', label: 'Still at checkout' },
];

function stageOf(order: BillingOrder) {
  if (order.payment_error)
    return { label: 'Payment failed', style: 'bg-danger-surface text-danger', at: order.created_at };
  if (order.checkout_dismissed_at)
    return {
      label: 'Checkout closed',
      style: 'bg-warning-surface text-warning',
      at: order.checkout_dismissed_at,
    };
  return { label: 'At checkout', style: 'bg-background text-subtle', at: order.created_at };
}

export function SignupLeads({ roles }: { roles: string[] }) {
  const canSend = roles.includes('super_admin') || roles.includes('support');
  const toast = useToast();
  const [emailOrder, setEmailOrder] = useState<BillingOrder | null>(null);
  const [preview, setPreview] = useState<LeadEmailPreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [sending, setSending] = useState(false);
  const [previewReload, setPreviewReload] = useState(0);
  useEffect(() => {
    if (!emailOrder) return;
    let cancelled = false;
    setPreview(null);
    setPreviewError('');
    void billingAdminApi
      .leadEmailPreview(emailOrder.id)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [emailOrder?.id, previewReload]);
  async function sendEmailNow() {
    if (!emailOrder || !preview || sending) return;
    setSending(true);
    try {
      await billingAdminApi.sendLeadEmail(emailOrder.id, preview.stage);
      toast({
        tone: 'success',
        title: 'Email sent',
        description: `SES accepted the email for ${preview.to}.`,
      });
      setEmailOrder(null);
      setPreview(null);
      setReload((value) => value + 1);
    } catch (err) {
      toast({ tone: 'error', title: 'Email could not be sent', description: (err as Error).message });
      setReload((value) => value + 1);
    } finally {
      setSending(false);
    }
  }

  const { version } = useLive();
  const [stage, setStage] = useState<LeadStage | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: BillingOrder[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    billingAdminApi
      .orders({ view: 'leads', stage, page })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError('');
        }
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [stage, page, version, reload]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Signup leads</h1>
        <p className="mt-1 text-sm text-subtle">
          People who started checkout but have not paid. Send a follow-up matched to their current checkout
          status, or let the scheduled reminder run. Paid checkouts move to Revenue.
        </p>
      </div>

      <FilterTabs
        tabs={TABS}
        value={stage}
        onChange={(value) => {
          setStage(value);
          setPage(1);
          setEmailOrder(null);
        }}
      />

      {error && (
        <PageError
          message={error}
          onRetry={() => {
            setError('');
            setReload((n) => n + 1);
          }}
        />
      )}

      <Card className="overflow-hidden">
        {!data && !error && (
          <div className="flex h-40 items-center justify-center text-subtle">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {data?.rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <UserPlus className="h-8 w-8 text-subtle" />
            <p className="font-semibold">No leads here</p>
            <p className="text-sm text-subtle">
              A lead appears when someone continues to payment from the pricing page.
            </p>
          </div>
        )}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-background/60 text-left text-xs uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-4 py-3 font-semibold">Lead</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Stage</th>
                  <th className="px-4 py-3 font-semibold">Last activity</th>
                  {canSend && <th className="px-4 py-3 font-semibold">Email</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((order) => {
                  const current = stageOf(order);
                  return (
                    <tr key={order.id} className="align-top hover:bg-background/50">
                      <td className="px-4 py-3">
                        <p className="font-medium">{order.business_name}</p>
                        <p className="text-xs text-subtle">{order.full_name}</p>
                      </td>
                      <td className="space-y-1 px-4 py-3">
                        <a
                          href={`mailto:${order.email}`}
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {order.email}
                        </a>
                        <a
                          href={`tel:${order.phone}`}
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {order.phone}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <p>{order.plan_snapshot?.name ?? '—'}</p>
                        <p className="text-xs text-subtle tabular-nums">
                          {formatMoney(order.total, order.currency)}
                          {order.coupon_code && (
                            <>
                              {' '}
                              · <span className="font-mono">{order.coupon_code}</span>
                            </>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cx(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                            current.style,
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {current.label}
                        </span>
                        {order.payment_error && (
                          <p className="mt-1 max-w-56 text-xs text-danger">{order.payment_error}</p>
                        )}
                        <p className="mt-1 text-xs text-subtle">
                          {order.followup_last_status === 'failed'
                            ? 'Last email attempt failed'
                            : order.followup_last_status === 'sending'
                              ? 'Email send in progress'
                              : order.followup_sent_at
                                ? `Follow-up emailed ${timeAgo(order.followup_sent_at)}`
                                : order.reminder_sent_at
                                  ? `Reminder emailed ${timeAgo(order.reminder_sent_at)}`
                                  : 'No email sent yet'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-subtle" title={formatDate(current.at)}>
                        {timeAgo(current.at)}
                        <p className="text-xs">Started {formatDate(order.created_at)}</p>
                      </td>
                      {canSend && (
                        <td className="px-4 py-3">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="whitespace-nowrap"
                            onClick={() => setEmailOrder(order)}
                          >
                            <Send size={14} />
                            Send email
                          </Button>
                          <p className="mt-1 text-xs text-subtle">{current.label} template</p>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && (
        <Pager
          page={page}
          pages={pages}
          onPage={(value) => {
            setPage(value);
            setEmailOrder(null);
          }}
        />
      )}
      {emailOrder && (
        <Drawer
          title="Send checkout follow-up"
          subtitle={emailOrder.business_name}
          onClose={() => {
            if (!sending) setEmailOrder(null);
          }}
          footer={
            <>
              <Button variant="ghost" disabled={sending} onClick={() => setEmailOrder(null)}>
                Cancel
              </Button>
              <Button disabled={!preview || sending} onClick={() => void sendEmailNow()}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sending ? 'Sending...' : 'Send email now'}
              </Button>
            </>
          }
        >
          {previewError ? (
            <PageError message={previewError} onRetry={() => setPreviewReload((value) => value + 1)} />
          ) : !preview ? (
            <p role="status" className="text-sm text-subtle">
              Loading email preview...
            </p>
          ) : (
            <>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-subtle">To</dt>
                  <dd className="break-all font-medium">{preview.to}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Template</dt>
                  <dd>
                    {preview.stage === 'failed'
                      ? 'Payment failed - retry and assistance'
                      : preview.stage === 'closed'
                        ? 'Checkout closed - resume your order'
                        : 'Checkout started - complete your purchase'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Subject</dt>
                  <dd className="font-semibold">{preview.subject}</dd>
                </div>
              </dl>
              {!preview.canResume && !preview.existingWorkspace && (
                <p className="rounded-xl bg-warning-surface p-3 text-xs text-warning">
                  This lead has no live payment order. The email will link to available plans instead of an
                  unusable payment link.
                </p>
              )}
              {preview.canResume && (
                <p className="text-xs text-subtle">
                  The email opens a secure loading screen and then the payment window for this saved order. If cancelled, the customer can retry or switch plans. The private link expires after 7 days.
                </p>
              )}
              {preview.lastSentAt && (
                <p className="text-xs text-subtle">
                  Last email accepted:{' '}
                  {new Date(preview.lastSentAt).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}{' '}
                  IST
                </p>
              )}
              <div className="overflow-hidden rounded-xl border border-line bg-white">
                <iframe
                  title="Checkout email preview"
                  sandbox=""
                  srcDoc={preview.html}
                  className="h-[55dvh] min-h-72 w-full border-0"
                />
              </div>
              <p className="text-xs text-subtle">
                Sending uses the lead's current status. A successful send cancels its pending automatic
                reminder. One minute is required between sends; SES acceptance does not confirm inbox
                delivery.
              </p>
            </>
          )}
        </Drawer>
      )}
    </div>
  );
}
