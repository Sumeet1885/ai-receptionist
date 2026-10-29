import { useEffect, useState } from 'react';
import { CreditCard, Loader2, TrendingUp, UserPlus } from 'lucide-react';
import { formatExpiryIST } from '@ai-receptionist/contracts';
import { billingAdminApi, formatMoney, type BillingOrder, type OrderStatus, type RevenueSummary } from '../api';
import { useLive } from '../live';
import { navigate } from '../router';
import { Card, FilterTabs, PageError, Pager, cx, formatDate } from '../ui';

const STATUS: Partial<Record<OrderStatus, { label: string; style: string; hint: string }>> = {
  paid: { label: 'Processing', style: 'bg-info-surface text-info', hint: 'Payment received; fulfilment pending.' },
  provisioned: { label: 'Completed', style: 'bg-success-surface text-success', hint: 'Purchase fulfilled.' },
  review: { label: 'Needs review', style: 'bg-warning-surface text-warning', hint: 'Payment received; check the reason shown before refunding or granting access.' },
  created: { label: 'Pending payment', style: 'bg-info-surface text-info', hint: 'Payment has not been confirmed.' },
  failed: { label: 'Failed', style: 'bg-danger-surface text-danger', hint: 'Payment could not be started.' },
};

const TABS: Array<{ value: OrderStatus | undefined; label: string }> = [
  { value: undefined, label: 'All paid' },
  { value: 'provisioned', label: 'Completed' },
  { value: 'review', label: 'Needs review' },
  { value: 'paid', label: 'Processing' },
  { value: 'created', label: 'Pending payment' },
  { value: 'failed', label: 'Failed' },
];

/** INR first; USD underneath when there is any. */
function Amounts({ money, large = false }: { money: { INR: number; USD: number }; large?: boolean }) {
  return (
    <>
      <p className={cx('font-display font-bold tracking-tight tabular-nums', large ? 'text-3xl' : 'text-lg')}>{formatMoney(money.INR, 'INR')}</p>
      {money.USD > 0 && <p className="text-sm font-semibold tabular-nums text-subtle">+ {formatMoney(money.USD, 'USD')}</p>}
    </>
  );
}

const monthLabel = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' });

export function Revenue() {
  const { version } = useLive();
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: BillingOrder[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const retry = () => { setError(''); setReload((n) => n + 1); };

  useEffect(() => {
    let cancelled = false;
    billingAdminApi.revenue()
      .then((result) => { if (!cancelled) setSummary(result); })
      .catch((err) => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [version, reload]);

  useEffect(() => {
    let cancelled = false;
    billingAdminApi.orders({ view: 'revenue', status, page, kind })
      .then((result) => { if (!cancelled) { setData(result); setError(''); } })
      .catch((err) => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [status, page, kind, version, reload]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const peak = summary ? Math.max(1, ...summary.monthly.map((m) => m.INR)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Revenue</h1>
        <p className="mt-1 text-sm text-subtle">Plan purchases, renewals, plan changes and extra calling minutes. Rupees and dollars are shown separately.</p>
      </div>

      {error && <PageError message={error} onRetry={retry} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!summary ? (error ? null : [0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface" />)) : (
          <>
            <Card className="min-w-0 bg-ink! p-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">This month</p>
              <div className="mt-2"><Amounts money={summary.totals.thisMonth} large /></div>
              <p className="mt-2 text-xs text-white/60">{summary.counts.thisMonth} payment{summary.counts.thisMonth === 1 ? '' : 's'}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Last 30 days</p>
              <div className="mt-2"><Amounts money={summary.totals.last30Days} large /></div>
              <p className="mt-2 text-xs text-subtle">{summary.counts.last30Days} payment{summary.counts.last30Days === 1 ? '' : 's'}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">All time</p>
              <div className="mt-2"><Amounts money={summary.totals.allTime} large /></div>
              <p className="mt-2 text-xs text-subtle">{summary.counts.allTime} payment{summary.counts.allTime === 1 ? '' : 's'}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Checkout conversion (30 days)</p>
              <p className="mt-2 font-display text-3xl font-bold tracking-tight tabular-nums">{summary.conversionLast30Days === null ? '—' : `${summary.conversionLast30Days}%`}</p>
              <button type="button" onClick={() => navigate('leads')} className="mt-2 flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <UserPlus className="h-3.5 w-3.5" /> {summary.leads.open} unpaid lead{summary.leads.open === 1 ? '' : 's'} to follow up
              </button>
            </Card>
          </>
        )}
      </div>

      {summary && (
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card className="flex h-80 min-w-0 flex-col overflow-hidden p-4 sm:p-5">
            <p className="flex shrink-0 items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Last 6 months (INR)</p>
            <div className="mt-5 flex min-h-0 flex-1 items-end gap-2 sm:gap-3" role="list" aria-label="Monthly revenue">
              {summary.monthly.map((month) => (
                <div key={month.month} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center gap-2" title={`${formatMoney(month.INR, 'INR')}${month.USD ? ` + ${formatMoney(month.USD, 'USD')}` : ''} · ${month.count} paid`}>
                  <span className="block w-full truncate text-center text-[10px] font-semibold tabular-nums text-subtle sm:text-[11px]">{month.INR ? formatMoney(month.INR, 'INR') : ''}</span>
                  <div className="flex min-h-0 w-full flex-1 items-end">
                    <div className="w-full shrink-0 rounded-t-lg bg-primary/80" data-revenue-bar={month.month} style={{ height: `${Math.max(month.INR ? 4 : 0, (month.INR / peak) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-subtle">{monthLabel(month.month)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex h-80 min-w-0 flex-col overflow-hidden">
            <p className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-5 py-4 text-sm font-semibold">Top 20 plans <span className="text-xs font-normal text-subtle">{summary.byPlan.length} plans</span></p>
            {summary.byPlan.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-subtle">No payments yet.</p>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="region" aria-label="Revenue by plan" tabIndex={0}>
              <table className="w-full table-fixed text-sm">
                <colgroup><col style={{ width: '54%' }} /><col style={{ width: '14%' }} /><col style={{ width: '32%' }} /></colgroup>
                <tbody className="divide-y divide-line">
                  {summary.byPlan.map((row) => (
                    <tr key={row.plan}>
                      <td className="px-4 py-3 font-medium"><span className="block truncate" title={row.plan}>{row.plan}</span></td>
                      <td className="px-2 py-3 text-subtle tabular-nums">{row.count}×</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums sm:text-sm">
                        {formatMoney(row.INR, 'INR')}{row.USD > 0 && <span className="block text-xs text-subtle">+ {formatMoney(row.USD, 'USD')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Purchase history</h2>
        <label className="flex items-center gap-2 text-sm">Purchase type
          <select className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2" value={kind} onChange={event => { setKind(event.target.value); setPage(1); }}>
            <option value="">All purchases</option><option value="initial">New plans</option><option value="renewal">Renewals</option><option value="plan_change">Plan changes</option><option value="topup">Minute top-ups</option>
          </select>
        </label>
        <FilterTabs tabs={TABS} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />
      </div>

      <Card className="overflow-hidden">
        {!data && !error && <div className="flex h-40 items-center justify-center text-subtle"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {data?.rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <CreditCard className="h-8 w-8 text-subtle" />
            <p className="font-semibold">{kind === 'topup' ? 'No minute top-ups yet' : kind === 'plan_change' ? 'No plan changes yet' : 'No purchases match these filters'}</p>
            <p className="text-sm text-subtle">{kind === 'topup' ? 'Saved top-up purchases appear here after payment is confirmed. Temporary test records are rolled back.' : 'Try another purchase type or payment status. Confirmed purchases appear automatically.'}</p>
          </div>
        )}
        {data && data.rows.length > 0 && (
          <div className="max-h-[32rem] overflow-auto overscroll-contain" role="region" aria-label="Payments table" tabIndex={0}>
            <table className="w-full min-w-[860px] table-fixed text-sm">
              <colgroup><col style={{ width: '30%' }} /><col style={{ width: '19%' }} /><col style={{ width: '12%' }} /><col style={{ width: '13%' }} /><col style={{ width: '12%' }} /><col style={{ width: '14%' }} /></colgroup>
              <thead className="sticky top-0 z-10 border-b border-line bg-background text-left text-xs uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Payment</th>
                  <th className="px-4 py-3 font-semibold">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((order) => {
                  const status = STATUS[order.status] ?? { label: order.status, style: 'bg-background text-subtle', hint: '' };
                  return (
                    <tr key={order.id} className="align-top hover:bg-background/50">
                      <td className="px-4 py-3">
                        <p className="truncate font-medium" title={order.business_name}>{order.business_name}</p>
                        <p className="truncate text-xs text-subtle" title={`${order.full_name} / ${order.email}`}>{order.full_name} · {order.email} · {order.phone}</p>
                      </td>
                      <td className="px-4 py-3"><span className="line-clamp-2 break-words" title={order.plan_snapshot?.name}>{order.plan_snapshot?.name ?? '—'}</span>
                        <p className="mt-1 text-xs font-semibold text-primary">{order.purchase_kind === 'topup' ? `Top-up · ${order.minutes_added} minutes` : order.purchase_kind === 'plan_change' ? 'Plan change' : order.purchase_kind === 'renewal' ? 'Renewal' : 'New plan'}</p>
                        {order.target_period_end && <p className="mt-1 text-xs text-subtle">Expires {formatExpiryIST(order.target_period_end)}</p>}
                        {order.status === 'created' && order.payment_error && <p className="mt-1 text-xs text-danger">Last payment attempt: {order.payment_error}</p>}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <p className="font-semibold">{formatMoney(order.total, order.currency)}</p>
                        {order.coupon_code && <p className="text-xs text-subtle"><span className="font-mono">{order.coupon_code}</span> −{formatMoney(order.discount, order.currency)}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span title={status.hint} className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', status.style)}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />{status.label}
                        </span>
                        {order.failure_reason && <p className="mt-1 max-w-56 text-xs text-danger">{order.failure_reason}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-subtle"><span className="block truncate" title={order.razorpay_payment_id || undefined}>{order.razorpay_payment_id ?? '—'}</span></td>
                      <td className="px-4 py-3 text-subtle">{formatDate(order.paid_at)}</td>
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
