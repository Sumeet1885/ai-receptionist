import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CreditCard, Loader2 } from 'lucide-react';
import { billingAdminApi, formatMoney, type BillingOrder, type OrderStatus } from '../api';
import { useLive } from '../live';
import { Button, Card, cx, formatDate } from '../ui';

const STATUS: Record<OrderStatus, { label: string; style: string; hint: string }> = {
  created: { label: 'Checkout started', style: 'bg-background text-subtle', hint: 'Not paid (yet).' },
  paid: { label: 'Paid', style: 'bg-info-surface text-info', hint: 'Paid; workspace being set up.' },
  provisioned: { label: 'Active', style: 'bg-success-surface text-success', hint: 'Paid and workspace created.' },
  review: { label: 'Needs review', style: 'bg-warning-surface text-warning', hint: 'Paid, but the email already has a login. Assign the plan by hand.' },
  failed: { label: 'Failed', style: 'bg-danger-surface text-danger', hint: 'Payment or setup failed.' },
};

const TABS: Array<{ value: OrderStatus | undefined; label: string }> = [
  { value: undefined, label: 'All' },
  { value: 'provisioned', label: 'Active' },
  { value: 'review', label: 'Needs review' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'created', label: 'Not paid' },
];

// Unpaid orders are leads: show how far the person got, so the team knows whom to follow up.
function statusOf(order: BillingOrder) {
  if (order.status !== 'created') return STATUS[order.status];
  if (order.payment_error) return { label: 'Payment failed', style: 'bg-danger-surface text-danger', hint: 'Tried to pay, but the payment failed. Follow up.' };
  if (order.checkout_dismissed_at) return { label: 'Checkout closed', style: 'bg-warning-surface text-warning', hint: 'Left before paying. Follow up.' };
  return STATUS.created;
}

export function Payments() {
  const { version } = useLive();
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: BillingOrder[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    billingAdminApi.orders({ status, page })
      .then((result) => { if (!cancelled) { setData(result); setError(''); } })
      .catch((err) => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [status, page, version]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Payments</h1>
        <p className="mt-1 text-sm text-subtle">Every checkout through Razorpay, paid or not. Paid orders create the customer's workspace and email them a link to confirm their address; unpaid ones are leads to follow up.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => { setStatus(tab.value); setPage(1); }}
            className={cx('cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', status === tab.value ? 'bg-ink text-white' : 'bg-surface text-subtle hover:text-ink')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-xl bg-danger-surface px-4 py-3 text-sm text-danger">{error}</p>}

      <Card className="overflow-hidden">
        {!data && !error && <div className="flex h-40 items-center justify-center text-subtle"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {data?.rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <CreditCard className="h-8 w-8 text-subtle" />
            <p className="font-semibold">No payments here</p>
            <p className="text-sm text-subtle">Orders appear as soon as a customer starts checkout.</p>
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
                  <th className="px-4 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((order) => {
                  const status = statusOf(order);
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
                        {(order.failure_reason || (order.status === 'created' && order.payment_error)) && (
                          <p className="mt-1 max-w-56 text-xs text-danger">{order.failure_reason || order.payment_error}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-subtle">{order.razorpay_payment_id ?? '—'}</td>
                      <td className="px-4 py-3 text-subtle">{formatDate(order.paid_at ?? order.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-subtle">
          <span>Page {page} of {pages}</span>
          <Button variant="secondary" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="secondary" size="sm" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
