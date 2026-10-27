import { useEffect, useState } from 'react';
import { Loader2, Mail, Phone, UserPlus } from 'lucide-react';
import { billingAdminApi, formatMoney, type BillingOrder, type LeadStage } from '../api';
import { useLive } from '../live';
import { Card, FilterTabs, Pager, cx, formatDate, timeAgo } from '../ui';

// Unpaid checkouts: people who chose a plan and entered their details but did not pay. Once a lead
// pays it moves to Revenue.

const TABS: Array<{ value: LeadStage | undefined; label: string }> = [
  { value: undefined, label: 'All unpaid' },
  { value: 'closed', label: 'Checkout closed' },
  { value: 'failed', label: 'Payment failed' },
  { value: 'started', label: 'Still at checkout' },
];

function stageOf(order: BillingOrder) {
  if (order.payment_error) return { label: 'Payment failed', style: 'bg-danger-surface text-danger', at: order.created_at };
  if (order.checkout_dismissed_at) return { label: 'Checkout closed', style: 'bg-warning-surface text-warning', at: order.checkout_dismissed_at };
  return { label: 'At checkout', style: 'bg-background text-subtle', at: order.created_at };
}

export function SignupLeads() {
  const { version } = useLive();
  const [stage, setStage] = useState<LeadStage | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: BillingOrder[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    billingAdminApi.orders({ view: 'leads', stage, page })
      .then((result) => { if (!cancelled) { setData(result); setError(''); } })
      .catch((err) => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [stage, page, version]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Signup leads</h1>
        <p className="mt-1 text-sm text-subtle">People who picked a paid plan and entered their details but have not paid. Each gets one reminder email with a link back to their order (5 minutes after closing the payment window, or 30 minutes after starting). Once they pay they move to Revenue.</p>
      </div>

      <FilterTabs tabs={TABS} value={stage} onChange={(value) => { setStage(value); setPage(1); }} />

      {error && <p role="alert" className="rounded-xl bg-danger-surface px-4 py-3 text-sm text-danger">{error}</p>}

      <Card className="overflow-hidden">
        {!data && !error && <div className="flex h-40 items-center justify-center text-subtle"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {data?.rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <UserPlus className="h-8 w-8 text-subtle" />
            <p className="font-semibold">No leads here</p>
            <p className="text-sm text-subtle">A lead appears when someone continues to payment from the pricing page.</p>
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
                        <a href={`mailto:${order.email}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline"><Mail className="h-3.5 w-3.5" />{order.email}</a>
                        <a href={`tel:${order.phone}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline"><Phone className="h-3.5 w-3.5" />{order.phone}</a>
                      </td>
                      <td className="px-4 py-3">
                        <p>{order.plan_snapshot?.name ?? '—'}</p>
                        <p className="text-xs text-subtle tabular-nums">
                          {formatMoney(order.total, order.currency)}{order.coupon_code && <> · <span className="font-mono">{order.coupon_code}</span></>}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', current.style)}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />{current.label}
                        </span>
                        {order.payment_error && <p className="mt-1 max-w-56 text-xs text-danger">{order.payment_error}</p>}
                        <p className="mt-1 text-xs text-subtle">{order.reminder_sent_at ? `Reminder emailed ${timeAgo(order.reminder_sent_at)}` : 'Reminder not sent yet'}</p>
                      </td>
                      <td className="px-4 py-3 text-subtle" title={formatDate(current.at)}>
                        {timeAgo(current.at)}
                        <p className="text-xs">Started {formatDate(order.created_at)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && <Pager page={page} pages={pages} onPage={setPage} />}
    </div>
  );
}
