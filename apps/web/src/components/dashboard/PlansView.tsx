import { useEffect, useRef, useState } from 'react';
import { formatExpiryIST } from '@ai-receptionist/contracts';
import { CreditCard, Loader2, X } from 'lucide-react';
import type { Bot } from '../../types';
import { billingApi, formatMoney, type Currency, type PublicPlan, type PlanFeature } from '../../lib/billingApi';
import { workspaceBillingApi, type WorkspaceMinutes, type WorkspacePurchase } from '../../lib/workspaceBillingApi';
import { openSupport } from '../../lib/supportDrawer';
import { BillingWorkspace, topupUnavailableReason } from '../billing/BillingWorkspace';
import { loadRazorpay } from '../billing/CheckoutView';
import { Button } from '../ui/button';
import { configuredTopup } from '../../lib/topupCatalogue';

interface PlansViewProps { activeBot: Bot | null; showToast: (message: string, type?: 'success' | 'error') => void }
export function PlansView({ showToast }: PlansViewProps) {
  const [accountSummary, setSummary] = useState<WorkspaceMinutes | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(null);
  const currency = selectedCurrency ?? accountSummary?.currency ?? 'INR';
  const summary = accountSummary ? { ...accountSummary, currency,
    topupOffer: accountSummary.topupOffers ? accountSummary.topupOffers[currency] : accountSummary.topupOffer?.currency === currency ? accountSummary.topupOffer : null } : null;
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [features, setFeatures] = useState<PlanFeature[]>([]);
  const [history, setHistory] = useState<{ rows: WorkspacePurchase[]; total: number; pageSize: number } | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  type PurchaseSelection =
    | { kind: 'plan'; plan: PublicPlan }
    | { kind: 'topup'; plan: PublicPlan; packMinutes: number; packAmount: number }
    | null;
  const [selection, setSelection] = useState<PurchaseSelection>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([workspaceBillingApi.summary(), billingApi.plans(), workspaceBillingApi.history(page)])
      .then(([usage, catalogue, purchases]) => { if (!cancelled) { setSummary(usage); setPlans(catalogue.plans); setFeatures(catalogue.features); setHistory(purchases); setError(''); } })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [page, reload]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!busy && !document.hidden) setReload(n => n + 1); }, 30_000);
    return () => window.clearInterval(timer);
  }, [busy]);
  useEffect(() => { if (selection && !dialog.current?.open) dialog.current?.showModal(); else if (!selection) dialog.current?.close(); }, [selection]);
  const refresh = () => { setPage(1); setReload(n => n + 1); };
  async function pay() {
    if (!summary || !selection || busy) return;
    setBusy(true);
    try {
      await loadRazorpay();
      const order = await workspaceBillingApi.order(selection.kind === 'topup'
        ? { kind: 'topup', plan: selection.plan.slug, currency }
        : { kind: 'plan_change', plan: selection.plan.slug, currency: summary.currency });
      if (!window.Razorpay) throw new Error('Payment window could not load. Please try again.');
      setSelection(null);
      let paymentHandled = false;
      const checkout = new window.Razorpay({
        key: order.keyId, order_id: order.razorpayOrderId, amount: order.amount, currency: order.currency,
        name: 'Bolega India', description: order.description, prefill: order.prefill,
        modal: { ondismiss: () => {
          setBusy(false);
          if (!paymentHandled) void billingApi.abandoned({ orderId: order.orderId, razorpayOrderId: order.razorpayOrderId, reason: 'closed' }).finally(refresh);
          else refresh();
        } },
        handler: async (result: any) => {
          paymentHandled = true;
          try {
            const confirmed = await billingApi.verify({ orderId: order.orderId, razorpayOrderId: result.razorpay_order_id,
              razorpayPaymentId: result.razorpay_payment_id, razorpaySignature: result.razorpay_signature });
            if (confirmed.status === 'provisioned') showToast('Payment confirmed. Your calling minutes are updated.', 'success');
            else showToast(confirmed.status === 'review' ? 'Payment received and needs review. Please contact support.' : 'Payment is processing. Refresh shortly before paying again.', 'error');
          } catch (err) { showToast((err as Error).message, 'error'); }
          finally { setBusy(false); refresh(); }
        },
      });
      checkout.on('payment.failed', (result: any) => {
        const message = result.error?.description || 'Payment failed. No minutes were added.';
        showToast(message, 'error'); setBusy(false);
        void billingApi.abandoned({ orderId: order.orderId, razorpayOrderId: order.razorpayOrderId, reason: 'failed', message }).finally(refresh);
      });
      checkout.open();
    } catch (err) { showToast((err as Error).message, 'error'); setBusy(false); }
  }
  const openTopup = (plan?: PublicPlan) => {
    const targetPlan = plan || plans.find(p => p.slug === summary?.planSlug);
    if (!targetPlan) return;
    const pack = configuredTopup(targetPlan, currency);
    if (!pack) return;
    setSelection({ kind: 'topup', plan: targetPlan, packMinutes: pack.minutes, packAmount: pack.amount });
  };

  return <div className="mx-auto max-w-6xl pb-8">
    {error && <div role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger-surface p-4 text-sm text-danger">{error} <button type="button" className="ml-2 underline" onClick={refresh}>Try again</button></div>}
    {!summary && !error && <div role="status" className="space-y-4" aria-label="Loading billing"><div className="h-12 animate-pulse rounded-full bg-surface-sunken" /><div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]"><div className="h-80 animate-pulse rounded-2xl bg-surface-sunken" /><div className="h-80 animate-pulse rounded-2xl bg-surface-sunken" /></div></div>}
    {summary && <BillingWorkspace summary={summary} plans={plans} features={features} history={history} page={page} busy={busy} onRefresh={refresh} onPage={setPage} onTopup={openTopup} onPlan={plan => setSelection({ kind: 'plan', plan })} onCurrency={setSelectedCurrency} />}
    <dialog ref={dialog} onCancel={() => setSelection(null)} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-6 text-text shadow-xl backdrop:bg-black/35">
      <div className="flex items-center justify-between gap-4"><h2 className="font-display text-xl font-semibold">{selection?.kind === 'topup' ? 'Add calling minutes' : 'Start a fresh month'}</h2><button type="button" aria-label="Close purchase" className="rounded-full p-2 hover:bg-background" onClick={() => setSelection(null)}><X size={18} /></button></div>
      {selection?.kind === 'topup' && <>
        <p className="mt-2 text-sm text-text-subtle">Add to your balance without changing your plan.</p>
        <div className="mt-4 space-y-3 rounded-xl bg-background p-4 text-sm">
          <div className="flex justify-between gap-3"><span className="text-text-subtle">Minute pack</span><span className="font-semibold">{selection.plan.name}</span></div>
          <div className="flex justify-between gap-3"><span className="text-text-subtle">Minutes added</span><span className="font-semibold">+{selection.packMinutes.toLocaleString('en-IN')} minutes</span></div>
          <div className="flex justify-between gap-3 border-t border-border pt-3"><span className="font-medium">Total to pay</span><span className="font-display text-xl font-semibold">{formatMoney(selection.packAmount, currency)}</span></div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-text-subtle">{summary?.expiresAt ? `Valid through ${formatExpiryIST(summary.expiresAt)}. ` : ''}Buying minutes does not extend your plan. Extra minutes are added directly to your existing balance.</p>
      </>}
      {selection?.kind === 'plan' && <>
        <p className="mt-4 font-semibold">{selection.plan.name} · {formatMoney(selection.plan.price[summary?.currency ?? currency], summary?.currency ?? currency)}/month</p>
        <p className="mt-2 text-sm text-text-subtle">You are purchasing a monthly subscription. Extra-minute packs are purchased separately.</p>
        <p className="mt-3 text-sm leading-relaxed text-text-subtle">Your new plan starts once payment is confirmed and lasts one calendar month, through 11:59 pm IST on its last day. Remaining minutes and top-ups from your previous plan are replaced. No setup fee or prorated credit.</p>
      </>}
      {selection && <><Button className="mt-5 w-full" disabled={busy} onClick={() => void pay()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}Continue to payment</Button><p className="mt-2 text-center text-xs text-text-subtle">Payment processed securely by Razorpay</p></>}
    </dialog>
  </div>;
}
