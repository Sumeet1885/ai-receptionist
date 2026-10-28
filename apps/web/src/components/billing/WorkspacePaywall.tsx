import { formatExpiryIST } from '@ai-receptionist/contracts';
import { useEffect, useState } from 'react';
import { Loader2, LockKeyhole, LogOut } from 'lucide-react';
import {
  billingApi,
  formatMoney,
  type PublicPlan,
  type Currency,
  type CheckoutOrder,
} from '../../lib/billingApi';
import { accountApi } from '../../lib/accountApi';
import { supabase } from '../../lib/supabaseClient';
import { BrandLogo } from '../ui/brand-logo';
import { Button } from '../ui/button';
import { loadRazorpay } from './CheckoutView';

export function WorkspacePaywall({
  trialEndsAt,
  signOut,
  onActivated,
}: {
  trialEndsAt: string | null;
  signOut: () => Promise<void>;
  onActivated: () => Promise<void>;
}) {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [selected, setSelected] = useState('');
  const [currency, setCurrency] = useState<Currency>('INR');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let stopped = false;
    setLoading(true);
    billingApi
      .plans()
      .then((data) => {
        if (!stopped) {
          const paid = data.plans.filter((p) => !p.contactSales);
          setPlans(paid);
          setSelected(paid[0]?.slug || '');
          setError('');
        }
      })
      .catch((err) => {
        if (!stopped) setError(err.message);
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
    };
  }, [reload]);
  const plan = plans.find((p) => p.slug === selected);
  async function checkPayment() {
    setChecking(true);
    try {
      const state = await accountApi.state();
      if (state.stage !== 'payment_required') await onActivated();
      else
        setError(
          'Payment has not been confirmed yet. Try checking again shortly.',
        );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }
  async function pay() {
    if (!plan || busy) return;
    setBusy(true);
    setError('');
    try {
      await loadRazorpay();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session)
        throw new Error('Your session ended. Sign out and sign in again.');
      const base =
        import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';
      const response = await fetch(`${base}/api/workspace-billing/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: plan.slug, currency }),
        signal: AbortSignal.timeout(30_000),
      });
      const order = (await response.json()) as CheckoutOrder & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(order.error || 'Could not start payment.');
      if (!window.Razorpay)
        throw new Error('The payment window could not load. Please try again.');
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.razorpayOrderId,
        amount: order.amount,
        currency: order.currency,
        name: 'Bolega India',
        description: order.description,
        prefill: order.prefill,
        modal: { ondismiss: () => setBusy(false) },
        handler: async (result: any) => {
          try {
            await billingApi.verify({
              orderId: order.orderId,
              razorpayOrderId: result.razorpay_order_id,
              razorpayPaymentId: result.razorpay_payment_id,
              razorpaySignature: result.razorpay_signature,
            });
            const state = await accountApi.state();
            if (state.stage === 'payment_required')
              setError(
                'Your payment is processing. Use “Check payment status” shortly.',
              );
            else await onActivated();
          } catch (err: any) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        },
      });
      checkout.on('payment.failed', (result: any) => {
        setError(
          result.error?.description || 'Payment failed. Please try again.',
        );
        setBusy(false);
      });
      checkout.open();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <main
      className="min-h-dvh bg-background px-4 py-6 text-text sm:px-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-lock-title"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <BrandLogo />
          <Button
            variant="secondary"
            onClick={() => void signOut().catch((err) => setError(err.message))}
          >
            <LogOut size={16} /> Sign out
          </Button>
        </div>
        <div className="mx-auto mt-10 max-w-2xl text-center">
          <LockKeyhole className="mx-auto text-primary" size={30} />
          <h1
            id="workspace-lock-title"
            className="mt-4 font-display text-3xl font-semibold"
          >
            {trialEndsAt
              ? 'Your trial period has ended'
              : 'Choose a plan to reopen your workspace'}
          </h1>
          <p className="mt-3 text-base text-text-subtle">
            Your workspace is locked. Select a paid plan and complete payment to
            restore access to your existing workspace.
          </p>
          {trialEndsAt && (
            <p className="mt-2 text-sm text-text-subtle">
              Trial ended{' '}
              {formatExpiryIST(trialEndsAt)}
              .
            </p>
          )}
        </div>
        {error && (
          <div
            role="alert"
            className="mx-auto mt-6 max-w-2xl rounded-xl bg-danger-surface p-4 text-sm text-danger"
          >
            {error}
          </div>
        )}
        <div
          className="mt-6 flex justify-center gap-2"
          role="radiogroup"
          aria-label="Payment currency"
        >
          {(['INR', 'USD'] as const).map((value) => (
            <button
              key={value}
              role="radio"
              aria-checked={currency === value}
              type="button"
              disabled={busy}
              className={`rounded-full border border-border px-5 py-2 text-sm ${currency === value ? 'bg-primary text-primary-foreground' : 'bg-surface'}`}
              onClick={() => setCurrency(value)}
            >
              {value}
            </button>
          ))}
        </div>
        {loading ? (
          <p className="mt-8 text-center" role="status">
            Loading plans...
          </p>
        ) : (
          <div
            className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            role="radiogroup"
            aria-label="Paid plan"
          >
            {plans
              .filter((p) => p.price[currency] > 0)
              .map((p) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected === p.slug}
                  disabled={busy}
                  key={p.slug}
                  onClick={() => setSelected(p.slug)}
                  className={`min-w-0 rounded-xl border p-5 text-left ${selected === p.slug ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-surface'}`}
                >
                  <h2 className="text-lg font-semibold">{p.name}</h2>
                  <p className="mt-3 text-2xl font-semibold">
                    {formatMoney(p.price[currency], currency)}
                    <span className="text-sm font-normal">/month</span>
                  </p>
                  <p className="mt-2 text-sm text-text-subtle">
                    {p.monthlyMinutes?.toLocaleString('en-IN')} minutes ·{' '}
                    {p.maxAgents} agents
                  </p>
                  <p className="mt-2 text-sm text-text-subtle">
                    {p.setupFee[currency] > 0
                      ? `${formatMoney(p.setupFee[currency], currency)} one-time setup`
                      : 'No setup fee'}
                  </p>
                </button>
              ))}
          </div>
        )}
        <div className="mx-auto mt-7 max-w-md space-y-3 text-center">
          {plan && plan.price[currency] > 0 && (
            <p className="font-semibold">
              Total today:{' '}
              {formatMoney(
                plan.price[currency] + plan.setupFee[currency],
                currency,
              )}
            </p>
          )}
          <Button
            className="w-full"
            disabled={busy || !plan || !plan.price[currency]}
            onClick={() => void pay()}
          >
            {busy && <Loader2 size={17} className="animate-spin" />}{' '}
            {busy ? 'Confirming payment...' : 'Pay and activate workspace'}
          </Button>
          <Button
            variant="ghost"
            disabled={busy || checking}
            onClick={() => void checkPayment()}
          >
            {checking ? 'Checking...' : 'Check payment status'}
          </Button>
          {!plans.length && !loading && (
            <Button variant="secondary" onClick={() => setReload((n) => n + 1)}>
              Reload plans
            </Button>
          )}
          <p className="text-xs text-text-subtle">
            Payment is processed by Razorpay. Access returns after the server
            verifies payment.
          </p>
        </div>
      </div>
    </main>
  );
}
