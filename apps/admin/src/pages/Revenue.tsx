import { useEffect, useState } from 'react';
import { CreditCard, Loader2, TrendingUp, UserPlus } from 'lucide-react';
import { billingAdminApi, formatMoney, type BillingOrder, type OrderStatus, type RevenueSummary } from '../api';
import { useLive } from '../live';
import { navigate } from '../router';
import { Card, FilterTabs, Pager, cx, formatDate } from '../ui';

const STATUS: Partial<Record<OrderStatus, { label: string; style: string; hint: string }>> = {
  paid: { label: 'Setting up', style: 'bg-info-surface text-info', hint: 'Paid; workspace being set up.' },
  provisioned: { label: 'Active', style: 'bg-success-surface text-success', hint: 'Paid and workspace created.' },
  review: { label: 'Needs review', style: 'bg-warning-surface text-warning', hint: 'Paid, but the email already has a login. Assign the plan by hand.' },
};

const TABS: Array<{ value: OrderStatus | undefined; label: string }> = [
  { value: undefined, label: 'All paid' },
  { value: 'provisioned', label: 'Active' },
  { value: 'review', label: 'Needs review' },
  { value: 'paid', label: 'Setting up' },
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
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: BillingOrder[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    billingAdminApi.revenue()
      .then((result) => { if (!cancelled) setSummary(result); })
      .catch((err) => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [version]);

  useEffect(() => {
    let cancelled = false;
    billingAdminApi.orders({ view: 'revenue', status, page })
      .then((result) => { if (!cancelled) { setData(result); setError(''); } })
      .catch((err) => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [status, page, version]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const peak = summary ? Math.max(1, ...summary.monthly.map((m) => m.INR)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Revenue</h1>
        <p className="mt-1 text-sm text-subtle">Money received through Razorpay checkouts (first month plus setup fee, after discounts). Rupees and dollars are shown separately.</p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-danger-surface px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!summary ? [0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface" />) : (
          <>
            <Card className="bg-ink p-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">This month</p>
              <div className="mt-2 [&_p:last-child]:text-white/70"><Amounts money={summary.totals.thisMonth} large /></div>
              <p className="mt-2 text-xs text-white/60">{summary.counts.thisMonth} paid signup{summary.counts.thisMonth === 1 ? '' : 's'}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Last 30 days</p>
              <div className="mt-2"><Amounts money={summary.totals.last30Days} large /></div>
              <p className="mt-2 text-xs text-subtle">{summary.counts.last30Days} paid signup{summary.counts.last30Days === 1 ? '' : 's'}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">All time</p>
              <div className="mt-2"><Amounts money={summary.totals.allTime} large /></div>
              <p className="mt-2 text-xs text-subtle">{summary.counts.allTime} paid signup{summary.counts.allTime === 1 ? '' : 's'}</p>
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
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-5">
            <p className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Last 6 months (INR)</p>
            <div className="mt-5 flex h-44 items-end gap-3" role="list">
              {summary.monthly.map((month) => (
                <div key={month.month} role="listitem" className="flex flex-1 flex-col items-center gap-2" title={`${formatMoney(month.INR, 'INR')}${month.USD ? ` + ${formatMoney(month.USD, 'USD')}` : ''} · ${month.count} paid`}>
                  <span className="text-[11px] font-semibold tabular-nums text-subtle">{month.INR ? formatMoney(month.INR, 'INR') : ''}</span>
                  <div className="flex w-full flex-1 items-end">
                    <div className="w-full rounded-t-lg bg-primary/80" style={{ height: `${Math.max(month.INR ? 4 : 0, (month.INR / peak) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-subtle">{monthLabel(month.month)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <p className="border-b border-line px-5 py-4 text-sm font-semibold">By plan</p>
            {summary.byPlan.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-subtle">No paid signups yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {summary.byPlan.map((row) => (
                    <tr key={row.plan}>
                      <td className="px-5 py-3 font-medium">{row.plan}</td>
                      <td className="px-5 py-3 text-subtle tabular-nums">{row.count}×</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {formatMoney(row.INR, 'INR')}{row.USD > 0 && <span className="block text-xs text-subtle">+ {formatMoney(row.USD, 'USD')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Payments</h2>
        <FilterTabs tabs={TABS} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />
      </div>

      <Card className="overflow-hidden">
        {!data && !error && <div className="flex h-40 items-center justify-center text-subtle"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {data?.rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <CreditCard className="h-8 w-8 text-subtle" />
            <p className="font-semibold">No payments here</p>
            <p className="text-sm text-subtle">Paid checkouts appear as soon as Razorpay confirms them.</p>
          </div>
        )}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-background/60 text-left text-xs uppercase tracking-wider text-subtle">
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
                        <p className="font-medium">{order.business_name}</p>
                        <p className="text-xs text-subtle">{order.full_name} · {order.email} · {order.phone}</p>
                      </td>
                      <td className="px-4 py-3">{order.plan_snapshot?.name ?? '—'}</td>
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
                      <td className="px-4 py-3 font-mono text-xs text-subtle">{order.razorpay_payment_id ?? '—'}</td>
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
