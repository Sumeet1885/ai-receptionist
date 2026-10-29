import { useState } from 'react';
import { formatDateTimeIST, formatExpiryIST } from '@ai-receptionist/contracts';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, CreditCard, History, Layers3, Plus, RefreshCw, Wallet, Zap } from 'lucide-react';
import { formatMoney, type Currency, type PlanFeature, type PublicPlan } from '../../lib/billingApi';
import type { WorkspaceMinutes, WorkspacePurchase } from '../../lib/workspaceBillingApi';
import { openSupport } from '../../lib/supportDrawer';
import { Button } from '../ui/button';
import { Card } from '../ui/layout';
import { PlanCard } from './PlanCard';
import { TopupCard } from './TopupCard';

const number = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 1 });
const purchaseNames = { initial: 'Plan purchase', renewal: 'Plan renewal', plan_change: 'Plan change', topup: 'Minute top-up' };
const tabs = [
  { key: 'overview', label: 'Overview', icon: Wallet },
  { key: 'topups', label: 'Minute top-ups', icon: Plus },
  { key: 'transactions', label: 'Transactions', icon: History },
  { key: 'plans', label: 'Change plan', icon: Layers3 },
] as const;

export function topupUnavailableReason(summary: WorkspaceMinutes) {
  if (!summary.active) return 'Your plan is not active. Choose a paid plan to start calling.';
  if (summary.isTrial) return 'Minute packs are available on paid plans. You can switch from your trial at any time.';
  if (summary.includedMinutes === null) return 'Your plan has a custom minute allowance. Contact our team for additional capacity.';
  return `A ${summary.currency} top-up price has not been configured for your plan. Try the other currency or contact our team.`;
}

function transactionStatus(row: WorkspacePurchase) {
  if (row.status === 'provisioned') return { label: 'Completed', style: 'bg-success-surface text-success' };
  if (row.status === 'review') return { label: 'Needs review', style: 'bg-warning-surface text-warning' };
  if (row.status === 'failed' || (row.status === 'created' && row.payment_error)) return { label: 'Payment failed', style: 'bg-danger-surface text-danger' };
  return { label: row.status === 'paid' ? 'Processing' : 'Pending', style: 'bg-info-surface text-info' };
}
function Status({ row }: { row: WorkspacePurchase }) {
  const state = transactionStatus(row);
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${state.style}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{state.label}</span>;
}

interface Props {
  summary: WorkspaceMinutes;
  plans: PublicPlan[];
  features: PlanFeature[];
  history: { rows: WorkspacePurchase[]; total: number; pageSize: number } | null;
  page: number;
  busy: boolean;
  onRefresh: () => void;
  onPage: (page: number) => void;
  onTopup: (quantity?: number) => void;
  onPlan: (plan: PublicPlan) => void;
  onCurrency: (currency: Currency) => void;
}

export function BillingWorkspace({ summary, plans, features, history, page, busy, onRefresh, onPage, onTopup, onPlan, onCurrency }: Props) {
  const [tab, setTab] = useState<(typeof tabs)[number]['key']>('overview');
  const total = summary.includedMinutes === null ? null : summary.includedMinutes + summary.topupMinutes;
  const usedPercent = total ? Math.min(100, Math.round(summary.usedMinutes / total * 100)) : 0;
  const exhausted = summary.active && summary.remainingMinutes !== null && summary.remainingMinutes <= 0;
  const offer = summary.topupOffer;
  const pages = history ? Math.max(1, Math.ceil(history.total / history.pageSize)) : 1;
  const tabId = (key: string) => `billing-tab-${key}`;
  const hasPreviewPrices = plans.some(plan => {
    const raw = plan.features[summary.currency === 'INR' ? 'topup_500_minutes' : 'topup_500_minutes_usd'];
    return !plan.contactSales && raw && /^\d+(\.\d{1,2})?$/.test(raw.trim()) && Number(raw) > 0;
  });
  function chooseTab(key: typeof tab) { setTab(key); }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <div role="tablist" aria-label="Billing" className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface-sunken p-1">
        {tabs.map(({ key, label, icon: Icon }, index) => <button key={key} id={tabId(key)} type="button" role="tab" aria-selected={tab === key} aria-controls={`billing-panel-${key}`} tabIndex={tab === key ? 0 : -1}
          onClick={() => chooseTab(key)} onKeyDown={event => {
            let next: number | undefined;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = tabs.length - 1;
            if (next !== undefined) { event.preventDefault(); chooseTab(tabs[next].key); document.getElementById(tabId(tabs[next].key))?.focus(); }
          }} className={`inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-medium transition sm:px-4 ${tab === key ? 'bg-text text-primary-foreground shadow-sm' : 'text-text-subtle hover:text-text'}`}>
          <Icon size={15} aria-hidden="true" />{label}
        </button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {tab !== 'transactions' && <div role="group" aria-label="Purchase currency" className="inline-flex rounded-full border border-border bg-surface p-1">{(['INR', 'USD'] as const).map(currency => <button key={currency} type="button" aria-pressed={summary.currency === currency} disabled={busy} onClick={() => onCurrency(currency)} className={`min-h-9 cursor-pointer rounded-full px-3 text-xs font-semibold transition disabled:cursor-wait ${summary.currency === currency ? 'bg-text text-primary-foreground' : 'text-text-subtle hover:bg-background'}`}>{currency === 'INR' ? '₹ INR' : '$ USD'}</button>)}</div>}
        <Button variant="ghost" size="sm" disabled={busy} onClick={onRefresh}><RefreshCw size={14} />Refresh</Button>
      </div>
    </div>

    {tab === 'topups' && <section id="billing-panel-topups" role="tabpanel" aria-labelledby={tabId('topups')}>
      <h2 className="font-display text-xl font-semibold">Extra minutes, whenever you need them</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-subtle">Add minutes without changing your plan. You can purchase before your balance runs out. Extra minutes expire on your current plan’s end date.</p>
      {offer ? <div className="mt-6 grid gap-4 md:grid-cols-3">{[1, 2, 3].map(quantity => <TopupCard key={quantity} planName={summary.planName || 'Current plan'} minutes={quantity * offer.minutes} amount={quantity * offer.amount} currency={summary.currency} expiry={formatExpiryIST(summary.expiresAt)} busy={busy} onChoose={() => onTopup(quantity)} />)}</div> : <>
        <div className="mt-5 rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed text-text-subtle">{topupUnavailableReason(summary)} {summary.isTrial && 'Here are the minute-pack prices available after you activate a paid plan.'}</div>
        {!hasPreviewPrices && <p role="status" className="mt-4 rounded-xl border border-warning/20 bg-warning-surface p-4 text-sm">{summary.currency} top-up prices are not available yet. Choose the other currency or contact support. Prices are set by the team; no exchange-rate conversion is applied.</p>}
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{plans.filter(plan => !plan.contactSales).map(plan => {
          const raw = plan.features[summary.currency === 'INR' ? 'topup_500_minutes' : 'topup_500_minutes_usd'];
          const packMinutes = Number(plan.features.topup_minutes ?? 500);
          if (!Number.isInteger(packMinutes) || packMinutes < 1 || packMinutes > 100000) return null;
          if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw.trim()) || Number(raw) <= 0) return null;
          return <TopupCard key={plan.slug} planName={plan.name} minutes={packMinutes} amount={Math.round(Number(raw) * 100)} currency={summary.currency} preview requiredPlanAmount={plan.price[summary.currency]} busy={busy} onChoose={() => setTab('plans')} />;
        })}</div>
        <Button variant="secondary" className="mt-4" onClick={() => summary.isTrial || !summary.active ? setTab('plans') : openSupport({ intent: 'sales', view: 'new' })}>{summary.isTrial || !summary.active ? 'Explore paid plans' : 'Contact our team'}</Button>
      </>}
    </section>}

    {tab === 'overview' && <div id="billing-panel-overview" role="tabpanel" aria-labelledby={tabId('overview')}>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden border-primary/20 bg-text text-primary-foreground">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs uppercase tracking-wider text-primary-foreground/65">Your calling plan</p><h2 className="mt-1 font-display text-2xl font-semibold">{summary.planName || 'No assigned plan'}</h2></div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/20 px-2.5 py-1 text-xs"><CheckCircle2 size={13} />{summary.isTrial ? 'Free trial' : summary.active ? 'Active' : 'Inactive'}</span>
            </div>
            <p className="mt-6 text-sm text-primary-foreground/75">Minutes available</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-2"><span className="font-display text-5xl font-semibold tracking-tight sm:text-6xl">{summary.remainingMinutes === null ? 'Unlimited' : number(summary.remainingMinutes)}</span>{summary.remainingMinutes !== null && <span className="text-sm text-primary-foreground/65">minutes left</span>}</div>
            {total !== null && <><div className="mt-5 flex justify-between gap-3 text-xs text-primary-foreground/75"><span>{number(summary.usedMinutes)} used of {number(total)} minutes</span><span>{usedPercent}% used</span></div><progress aria-label="Calling minutes used" className="mt-2 h-2 w-full overflow-hidden rounded-full accent-[var(--color-accent-lime)]" max={Math.max(total, 1)} value={Math.min(summary.usedMinutes, total)} /></>}
            <div className="mt-5 flex items-start gap-2 border-t border-primary-foreground/15 pt-4 text-xs leading-relaxed text-primary-foreground/75"><CalendarDays size={15} className="mt-0.5 shrink-0" />{summary.expiresAt ? `Plan ends ${formatExpiryIST(summary.expiresAt)}` : 'Contact support to check your billing period.'}</div>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Card padding="sm"><p className="text-xs text-text-subtle">Included in your plan</p><p className="mt-1 text-xl font-semibold tabular-nums">{summary.includedMinutes === null ? 'Custom' : number(summary.includedMinutes)}<span className="ml-1 text-xs font-normal text-text-subtle">minutes</span></p></Card>
            <Card padding="sm"><p className="text-xs text-text-subtle">Top-ups this period</p><p className="mt-1 text-xl font-semibold tabular-nums">{number(summary.topupMinutes)}<span className="ml-1 text-xs font-normal text-text-subtle">minutes</span></p></Card>
          </div>
          <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-text-subtle"><Layers3 size={15} className="shrink-0" />One minute balance for all your receptionists, inbound and outbound calls.</p>
          {exhausted && <div role="status" className="rounded-xl border border-warning/25 bg-warning-surface p-4 text-sm"><p className="font-semibold text-warning">Your calling minutes are used up</p><p className="mt-1 text-text-subtle">Add a minute pack or change your plan to resume new calls.</p></div>}
        </div>
        <Card className="min-w-0">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-lime-soft text-primary"><Zap size={21} /></span>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-xl font-semibold">Minute top-ups</h2><button type="button" className="cursor-pointer text-xs font-semibold text-primary hover:underline" onClick={() => setTab('topups')}>View all packs →</button></div>
          <p className="mt-1 text-sm leading-relaxed text-text-subtle">Buy extra minutes whenever you need them—even if you still have minutes left.</p>
          {offer ? <>
            <div className="my-5 space-y-2">{[1, 2, 3].map(quantity => <button key={quantity} type="button" disabled={busy} onClick={() => onTopup(quantity)} className="group flex min-h-16 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left transition hover:border-primary hover:bg-primary/5 disabled:cursor-wait disabled:opacity-60">
              <span><span className="block text-sm font-semibold">+{number(quantity * offer.minutes)} minutes</span><span className="mt-0.5 block text-xs text-text-subtle">{quantity} {quantity === 1 ? 'pack' : 'packs'}</span></span>
              <span className="flex items-center gap-2 text-sm font-semibold">{formatMoney(quantity * offer.amount, summary.currency)}<ArrowRight size={15} className="text-primary" /></span>
            </button>)}</div>
            <Button className="w-full" disabled={busy} onClick={() => onTopup()}><Plus size={16} />Buy minutes</Button>
            <p className="mt-3 flex gap-2 text-xs leading-relaxed text-text-subtle"><Clock3 size={14} className="mt-0.5 shrink-0" />Top-ups expire with your plan. Your plan end date stays the same.</p>
          </> : <div className="mt-5 rounded-xl border border-border bg-background p-4"><p className="text-sm leading-relaxed text-text-subtle">{topupUnavailableReason(summary)}</p><Button variant="secondary" className="mt-3 w-full" onClick={() => summary.isTrial || !summary.active ? setTab('plans') : openSupport({ intent: 'sales', view: 'new' })}>{summary.isTrial || !summary.active ? 'Explore paid plans' : 'Ask about extra minutes'}<ArrowRight size={14} /></Button></div>}
          <div className="mt-5 border-t border-border pt-4"><button type="button" className="flex w-full cursor-pointer items-center justify-between gap-2 text-sm font-medium text-primary" onClick={() => setTab('transactions')}>View your transactions<History size={16} /></button></div>
        </Card>
      </div>
      <details className="mt-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm"><summary className="cursor-pointer font-medium">How are calling minutes calculated?</summary><p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-subtle">Unconnected calls use no minutes. Connected calls under 25 seconds use half a minute; longer calls round up to the next whole minute. Usage updates after calls sync. Unused top-ups expire with the current plan.</p></details>
    </div>}

    {tab === 'plans' && <section id="billing-panel-plans" role="tabpanel" aria-labelledby={tabId('plans')}>
      <h2 className="font-display text-xl font-semibold">A plan for your next conversation</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-subtle">Changing plans starts a fresh month immediately. There is no additional setup fee. Your previous balance is replaced, including unused top-ups; no prorated credit applies.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{plans.map(plan => <PlanCard key={plan.slug} plan={plan} currency={summary.currency} features={features} existingCustomer current={plan.slug === summary.planSlug} busy={busy} onChoose={() => plan.contactSales ? openSupport({ intent: 'sales', view: 'new' }) : onPlan(plan)} />)}</div>
    </section>}

    {tab === 'transactions' && <section id="billing-panel-transactions" role="tabpanel" aria-labelledby={tabId('transactions')}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-display text-xl font-semibold">Transaction history</h2><p className="mt-1 text-sm text-text-subtle">Plans and minute packs, with payment status and references.</p></div><span className="text-xs text-text-subtle">{history?.total ?? 0} transactions · All times IST</span></div>
      {!history ? <p role="status" className="p-8 text-center text-sm text-text-subtle">Loading transactions…</p> : history.rows.length === 0 ? <Card className="py-12 text-center"><CreditCard size={32} className="mx-auto text-primary/50" /><h3 className="mt-3 font-semibold">Your purchases will appear here</h3><p className="mt-1 text-sm text-text-subtle">Track plan payments and extra minute packs in one place.</p><Button variant="secondary" className="mt-4" onClick={() => setTab('overview')}>Back to overview</Button></Card> : <>
        <div className="space-y-3 md:hidden">{history.rows.map(row => <Card key={row.id} padding="sm">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold">{purchaseNames[row.purchase_kind] || 'Plan purchase'}</p><p className="mt-1 break-words text-xs text-text-subtle">{row.minutes_added ? `+${number(row.minutes_added)} minutes · ` : ''}{row.planName}</p></div><p className="shrink-0 text-sm font-semibold">{formatMoney(row.total, row.currency)}</p></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><Status row={row} /><span className="text-xs text-text-subtle">{formatDateTimeIST(row.paid_at || row.created_at)}</span></div>
          {row.target_period_end && <p className="mt-3 text-xs text-text-subtle">Top-up expiry: {formatExpiryIST(row.target_period_end)}</p>}
          <p className="mt-3 break-all border-t border-border pt-3 text-xs text-text-subtle">Payment reference: <span className="font-mono">{row.razorpay_payment_id || 'Not available yet'}</span></p>
        </Card>)}</div>
        <Card padding="none" className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-background text-xs text-text-subtle"><tr>{['Purchase', 'Amount', 'Status', 'Date (IST)', 'Payment reference'].map(label => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{history.rows.map(row => <tr key={row.id} className="border-t border-border"><td className="max-w-72 px-4 py-4"><p className="font-medium">{purchaseNames[row.purchase_kind] || 'Plan purchase'}{row.minutes_added ? ` · +${number(row.minutes_added)} min` : ''}</p><p className="mt-1 break-words text-xs text-text-subtle">{row.planName}</p>{row.target_period_end && <p className="mt-1 text-xs text-text-subtle">Expires {formatExpiryIST(row.target_period_end)}</p>}</td><td className="whitespace-nowrap px-4 py-4 font-semibold tabular-nums">{formatMoney(row.total, row.currency)}</td><td className="px-4 py-4"><Status row={row} /></td><td className="px-4 py-4 text-xs text-text-subtle">{formatDateTimeIST(row.paid_at || row.created_at)}</td><td className="max-w-44 break-all px-4 py-4 font-mono text-xs text-text-subtle">{row.razorpay_payment_id || '—'}</td></tr>)}</tbody></table></div></Card>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-xs text-text-subtle">Showing {(page - 1) * history.pageSize + 1}–{Math.min(page * history.pageSize, history.total)} of {history.total}</p><div className="flex items-center gap-3"><Button size="sm" variant="secondary" disabled={page <= 1 || busy} onClick={() => onPage(page - 1)}>Previous</Button><span className="text-xs text-text-subtle">{page} / {pages}</span><Button size="sm" variant="secondary" disabled={page >= pages || busy} onClick={() => onPage(page + 1)}>Next</Button></div></div>
      </>}
    </section>}
  </div>;
}
