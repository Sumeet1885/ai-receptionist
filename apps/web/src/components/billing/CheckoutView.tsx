import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, Lock, MailCheck, Tag } from 'lucide-react';
import { LIMITS, validateCheckoutContact, type CheckoutContactErrors, type CheckoutContactInput } from '@ai-receptionist/contracts';
import { Button } from '../ui/button';
import { Input, Label } from '../ui/field';
import { PhoneField } from '../ui/phone-field';
import { Card, Container } from '../ui/layout';
import { Honeypot } from '../security/Honeypot';
import { Turnstile } from '../security/Turnstile';
import { usePublicFormGuard } from '../../lib/publicForm';
import { billingApi, BillingError, formatMoney, type CheckoutOrder, type Currency, type PublicPlan, type Quote } from '../../lib/billingApi';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (response: any) => void) => void };
  }
}

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let razorpayLoader: Promise<void> | null = null;

function loadRazorpay() {
  razorpayLoader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayLoader = null;
      reject(new Error('The payment window could not load. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return razorpayLoader;
}

interface CheckoutViewProps {
  navigate: (path: string) => void;
}

const EMPTY: CheckoutContactInput = { fullName: '', email: '', phone: '', businessName: '', password: '', consent: false };

export const CheckoutView: React.FC<CheckoutViewProps> = ({ navigate }) => {
  // Set when arriving from the payment reminder email (?resume=<order>.<token>).
  const [resumeLink] = useState(() => new URLSearchParams(window.location.search).get('resume'));
  const [slug, setSlug] = useState(() => new URLSearchParams(window.location.search).get('plan') ?? '');
  const [currency, setCurrency] = useState<Currency>(() => (new URLSearchParams(window.location.search).get('currency') === 'USD' ? 'USD' : 'INR'));
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<CheckoutContactInput>(EMPTY);
  const [errors, setErrors] = useState<CheckoutContactErrors>({});
  const [coupon, setCoupon] = useState('');
  const [couponError, setCouponError] = useState('');
  const [applying, setApplying] = useState(false);
  const [paying, setPaying] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState<{ status: string; email: string } | null>(null);
  const [order, setOrder] = useState<{ key: string; value: CheckoutOrder } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const guard = usePublicFormGuard();

  // Plans that can be bought online, for switching plan without leaving the page.
  useEffect(() => {
    billingApi.plans().then((data) => setPlans(data.plans.filter((p) => !p.contactSales))).catch(() => undefined);
  }, []);

  // Reopen the saved order from the reminder email and go straight to the confirmation.
  useEffect(() => {
    if (!resumeLink) return;
    billingApi.resume(resumeLink)
      .then(async (data) => {
        setPlan(data.plan);
        setQuote(data.quote);
        setCurrency(data.quote.currency);
        setForm({ ...EMPTY, fullName: data.order.prefill.name, email: data.order.prefill.email, phone: data.order.prefill.contact, businessName: data.businessName });
        setOrder({ key: 'resumed', value: data.order });
        // Keep the one-time token out of the address bar and history.
        window.history.replaceState(null, '', `/checkout?${new URLSearchParams({ plan: data.plan.slug, currency: data.quote.currency })}`);
        await loadRazorpay();
        setConfirming(true);
      })
      .catch((err) => setLoadError((err as Error).message));
  }, [resumeLink]);

  // Re-quote when the plan or currency changes, keeping the applied coupon if it still applies.
  const appliedCoupon = useRef('');
  appliedCoupon.current = quote?.coupon?.code ?? '';
  useEffect(() => {
    if (!slug) {
      if (!resumeLink) setLoadError('Choose a plan first.');
      return;
    }
    let cancelled = false;
    const code = appliedCoupon.current;
    billingApi.quote(slug, currency, code)
      .catch((err) => {
        if (!code) throw err;
        setCouponError(`${code} was removed: ${(err as Error).message}`);
        return billingApi.quote(slug, currency, '');
      })
      .then((data) => { if (!cancelled) { setPlan(data.plan); setQuote(data.quote); setLoadError(''); } })
      .catch((err) => { if (!cancelled) setLoadError((err as Error).message); });
    return () => { cancelled = true; };
  }, [slug, currency]);

  function choosePlan(nextSlug: string, nextCurrency: Currency) {
    setSlug(nextSlug);
    setCurrency(nextCurrency);
    setFormError('');
    setCouponError('');
    window.history.replaceState(null, '', `/checkout?${new URLSearchParams({ plan: nextSlug, currency: nextCurrency })}`);
  }

  const set = <K extends keyof CheckoutContactInput>(key: K, value: CheckoutContactInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  async function applyCoupon(code: string) {
    setApplying(true);
    setCouponError('');
    try {
      setQuote((await billingApi.quote(slug, currency, code)).quote);
    } catch (err) {
      setCouponError((err as Error).message);
    } finally {
      setApplying(false);
    }
  }

  // Step 1, details: the order is created here, so the lead is kept even if they never pay.
  // Pressing Continue again with unchanged details reuses it.
  async function review(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');
    const result = validateCheckoutContact(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const key = JSON.stringify({ ...result.value, plan: slug, currency, coupon: quote?.coupon?.code ?? '' });
    if (order?.key === key) return setConfirming(true);
    if (!guard.captchaReady) return setFormError('Please complete the security check.');

    setPaying(true);
    try {
      const [created] = await Promise.all([
        billingApi.createOrder({
          ...form,
          plan: slug,
          currency,
          couponCode: quote?.coupon?.code ?? '',
          ...guard.guardFields(),
        }),
        loadRazorpay(),
      ]);
      setOrder({ key, value: created });
      setConfirming(true);
    } catch (err) {
      setFormError((err as Error).message);
      if (err instanceof BillingError && err.fields) setErrors(err.fields as CheckoutContactErrors);
    } finally {
      guard.resetChallenge();
      setPaying(false);
    }
  }

  function cancelConfirm() {
    setConfirming(false);
    if (order) void billingApi.abandoned({ orderId: order.value.orderId, razorpayOrderId: order.value.razorpayOrderId, reason: 'closed' });
  }

  // Step 2, confirmed: Razorpay opens straight away.
  function openPayment() {
    setConfirming(false);
    if (!order || !window.Razorpay) return setFormError('The payment window could not load. Check your connection and try again.');
    const current = order.value;
    const ids = { orderId: current.orderId, razorpayOrderId: current.razorpayOrderId };
    setPaying(true);

    const checkout = new window.Razorpay({
      key: current.keyId,
      amount: current.amount,
      currency: current.currency,
      order_id: current.razorpayOrderId,
      name: 'Bolega India',
      description: current.description,
      prefill: current.prefill,
      theme: { color: '#24695b' },
      modal: {
        ondismiss: () => {
          setPaying(false);
          setFormError('Payment was not completed. Your details are saved: change the plan in the order summary if you like, then press Continue.');
          void billingApi.abandoned({ ...ids, reason: 'closed' });
        },
      },
      handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        try {
          const verified = await billingApi.verify({
            ...ids,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          setDone({ status: verified.status, email: current.prefill.email });
        } catch (err) {
          setFormError(`Your payment went through, but we could not confirm it yet: ${(err as Error).message} We will email you as soon as it is confirmed.`);
        } finally {
          setPaying(false);
        }
      },
    });
    checkout.on('payment.failed', (response: { error?: { description?: string } }) => {
      const message = response.error?.description || 'The payment failed. Please try again.';
      setFormError(message);
      void billingApi.abandoned({ ...ids, reason: 'failed', message });
    });
    checkout.open();
  }

  if (done) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background px-4 py-16">
        <Card variant="floating" padding="lg" className="w-full max-w-lg rounded-large text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-surface text-success">
            {done.status === 'provisioned' ? <MailCheck className="h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}
          </span>
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-[-0.04em] text-text">
            {done.status === 'provisioned' ? 'Payment received. Now confirm your email' : 'Payment received'}
          </h1>
          <p className="mt-3 text-sm text-text-subtle">
            {done.status === 'provisioned'
              ? <>Your workspace is ready. We sent a confirmation link to <span className="font-semibold text-text">{done.email}</span>. Open it to confirm your email, then sign in with the password you just chose.</>
              : <>Thank you. Our team is finishing your workspace setup and will email <span className="font-semibold text-text">{done.email}</span> shortly.</>}
          </p>
          {done.status === 'provisioned' && (
            <p className="mt-4 text-xs text-text-subtle">
              No email after a few minutes? Check spam, or{' '}
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate('/auth?mode=resend')}>send a new link</button>.
            </p>
          )}
          <Button className="mt-8" onClick={() => navigate('/')}>Back to home</Button>
        </Card>
      </div>
    );
  }

  // Each field is checked as the person leaves it (once something is typed); the rest on submit.
  const checkField = (key: keyof CheckoutContactInput) => {
    const value = form[key];
    if (typeof value !== 'string' || !value.trim()) return;
    const result = validateCheckoutContact(form);
    setErrors((prev) => ({ ...prev, [key]: result.ok ? undefined : result.errors[key] }));
  };

  const fieldProps = (key: keyof CheckoutContactInput) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `co-${key}-error` : undefined,
    onBlur: () => checkField(key),
  });
  const fieldError = (key: keyof CheckoutContactInput) => errors[key] && <p id={`co-${key}-error`} className="mt-1 text-xs text-danger">{errors[key]}</p>;

  return (
    <div className="flex-1 bg-background py-12 sm:py-16">
      <Container className="max-w-5xl">
        <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => navigate('/pricing')}>← All plans</button>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] text-text">Checkout</h1>

        {loadError ? (
          <p role="alert" className="mt-8 rounded-medium bg-danger-surface px-4 py-3 text-sm text-danger">{loadError}</p>
        ) : (
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <form onSubmit={review} noValidate className="space-y-4">
              <Honeypot {...guard.honeypotProps} />
              <Card padding="lg" className="space-y-4">
                <h2 className="font-display text-xl font-semibold text-text">Your details</h2>
                <p className="-mt-2 text-sm text-text-subtle">This email and password become your workspace login. After payment we email a link to confirm the address.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="co-fullName">Full name</Label>
                    <Input id="co-fullName" autoComplete="name" maxLength={LIMITS.personName.max} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} {...fieldProps('fullName')} />
                    {fieldError('fullName')}
                  </div>
                  <div>
                    <Label htmlFor="co-businessName">Business name</Label>
                    <Input id="co-businessName" autoComplete="organization" maxLength={LIMITS.businessName.max} value={form.businessName} onChange={(e) => set('businessName', e.target.value)} {...fieldProps('businessName')} />
                    {fieldError('businessName')}
                  </div>
                  <div>
                    <Label htmlFor="co-email">Work email</Label>
                    <Input id="co-email" type="email" autoComplete="email" maxLength={LIMITS.email.max} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@company.com" {...fieldProps('email')} />
                    {fieldError('email')}
                  </div>
                  <div>
                    <Label htmlFor="co-phone">Mobile number</Label>
                    <PhoneField id="co-phone" value={form.phone} onChange={(value) => set('phone', value)} {...fieldProps('phone')} />
                    {fieldError('phone')}
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="co-password">Create a password</Label>
                    <div className="relative">
                      <Input
                        id="co-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        maxLength={LIMITS.customerPassword.max}
                        className="pr-11"
                        value={form.password}
                        onChange={(e) => set('password', e.target.value)}
                        {...fieldProps('password')}
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-subtle hover:text-text"
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {fieldError('password') || <p className="mt-1 text-xs text-text-subtle">At least {LIMITS.customerPassword.min} characters. You will use it to sign in.</p>}
                  </div>
                </div>
                <label className="flex items-start gap-3 text-sm text-text">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} {...fieldProps('consent')} />
                  <span>I agree to the terms of service and to Bolega India contacting me about my account.</span>
                </label>
                {fieldError('consent')}
              </Card>

              <Turnstile {...guard.turnstileProps} />
              {formError && <p role="alert" className="rounded-small border border-danger/30 bg-danger-surface px-4 py-3 text-sm text-danger">{formError}</p>}

              <Button type="submit" size="lg" className="w-full" disabled={paying || !quote}>
                {paying ? <><Loader2 className="h-4 w-4 animate-spin" /> Please wait…</> : <><Lock className="h-4 w-4" /> Continue to payment</>}
              </Button>
              <p className="text-center text-xs text-text-subtle">Payments are processed securely by Razorpay. We never see your card details.</p>
            </form>

            <Card padding="lg" className="lg:sticky lg:top-24">
              {!plan || !quote ? (
                <div className="h-64 animate-pulse rounded-medium bg-surface-sunken" />
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-subtle">Order summary</p>
                    {plan.price.INR > 0 && plan.price.USD > 0 && (
                      <div className="inline-flex rounded-pill border border-border p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Currency">
                        {(['INR', 'USD'] as const).map((c) => (
                          <button
                            key={c}
                            type="button"
                            role="radio"
                            aria-checked={currency === c}
                            disabled={paying}
                            onClick={() => choosePlan(slug || plan.slug, c)}
                            className={`rounded-pill px-2.5 py-1 ${currency === c ? 'bg-text text-background' : 'text-text-subtle hover:text-text'}`}
                          >
                            {c === 'INR' ? '₹ INR' : '$ USD'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {plans.length > 1 ? (
                    <fieldset className="mt-3 space-y-2" disabled={paying}>
                      <legend className="sr-only">Plan</legend>
                      {plans.filter((p) => p.price[currency] > 0).map((p) => (
                        <label
                          key={p.slug}
                          className={`flex cursor-pointer items-center justify-between gap-3 rounded-medium border px-3.5 py-2.5 text-sm transition-colors ${p.slug === (slug || plan.slug) ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <input type="radio" name="co-plan" className="h-4 w-4 accent-(--color-primary)" checked={p.slug === (slug || plan.slug)} onChange={() => choosePlan(p.slug, currency)} />
                            <span className="font-semibold text-text">{p.name}</span>
                            {p.featured && <span className="rounded-pill bg-accent-lime px-2 py-0.5 text-[10px] font-bold uppercase text-text">Popular</span>}
                          </span>
                          <span className="text-text-subtle">{formatMoney(p.price[currency], currency)}/mo</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-text">{plan.name}</h2>
                  )}
                  <p className="mt-3 text-sm text-text-subtle">
                    {plan.monthlyMinutes?.toLocaleString('en-IN')} minutes/month · {plan.maxAgents} agents · {plan.maxConcurrentCalls} concurrent calls
                  </p>

                  <dl className="mt-6 space-y-3 text-sm">
                    <div className="flex justify-between"><dt className="text-text-subtle">First month</dt><dd className="text-text">{formatMoney(quote.planAmount, quote.currency)}</dd></div>
                    <div className="flex justify-between"><dt className="text-text-subtle">One-time setup</dt><dd className="text-text">{quote.setupFee ? formatMoney(quote.setupFee, quote.currency) : 'Included'}</dd></div>
                    {quote.discount > 0 && (
                      <div className="flex justify-between text-success"><dt>Discount ({quote.coupon?.code})</dt><dd>−{formatMoney(quote.discount, quote.currency)}</dd></div>
                    )}
                    <div className="flex justify-between border-t border-border pt-3 text-base font-semibold text-text"><dt>Total today</dt><dd>{formatMoney(quote.total, quote.currency)}</dd></div>
                  </dl>
                  <p className="mt-2 text-xs text-text-subtle">Then {formatMoney(quote.planAmount, quote.currency)} per month.</p>

                  <div className="mt-6 border-t border-border pt-5">
                    {quote.coupon ? (
                      <div className="flex items-center justify-between rounded-small bg-success-surface px-3 py-2 text-sm text-success">
                        <span className="flex items-center gap-2"><Tag className="h-4 w-4" /> {quote.coupon.code} applied</span>
                        <button type="button" className="text-xs font-semibold underline" onClick={() => { setCoupon(''); void applyCoupon(''); }}>Remove</button>
                      </div>
                    ) : (
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => { e.preventDefault(); if (coupon.trim()) void applyCoupon(coupon.trim()); }}
                      >
                        <label className="sr-only" htmlFor="co-coupon">Coupon code</label>
                        <Input id="co-coupon" maxLength={LIMITS.couponCode.max} value={coupon} onChange={(e) => { setCoupon(e.target.value.toUpperCase()); setCouponError(''); }} placeholder="Coupon code" aria-invalid={couponError ? true : undefined} />
                        <Button type="submit" variant="secondary" disabled={applying || !coupon.trim()}>{applying ? 'Checking…' : 'Apply'}</Button>
                      </form>
                    )}
                    {couponError && <p role="alert" className="mt-2 text-xs text-danger">{couponError}</p>}
                  </div>
                </>
              )}
            </Card>
          </div>
        )}
      </Container>

      {confirming && order && plan && quote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="co-confirm-title">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={cancelConfirm} />
          <Card variant="floating" padding="lg" className="relative w-full max-w-md rounded-large">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-subtle">Confirm your order</p>
            <h2 id="co-confirm-title" className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-text">{plan.name}</h2>
            <p className="mt-1 text-sm text-text-subtle">
              For {form.businessName.trim()} · login <span className="font-medium text-text">{order.value.prefill.email}</span>
            </p>
            <dl className="mt-5 space-y-2.5 text-sm">
              <div className="flex justify-between"><dt className="text-text-subtle">First month</dt><dd className="text-text">{formatMoney(quote.planAmount, quote.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-text-subtle">One-time setup</dt><dd className="text-text">{quote.setupFee ? formatMoney(quote.setupFee, quote.currency) : 'Included'}</dd></div>
              {quote.discount > 0 && (
                <div className="flex justify-between text-success"><dt>Discount ({quote.coupon?.code})</dt><dd>−{formatMoney(quote.discount, quote.currency)}</dd></div>
              )}
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold text-text"><dt>Total today</dt><dd>{formatMoney(order.value.amount, order.value.currency)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-text-subtle">Then {formatMoney(quote.planAmount, quote.currency)} per month.</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
              <Button variant="secondary" className="sm:flex-1" onClick={cancelConfirm}>Edit details</Button>
              <Button className="sm:flex-1" onClick={openPayment} autoFocus><Lock className="h-4 w-4" /> Pay {formatMoney(order.value.amount, order.value.currency)}</Button>
            </div>
            <p className="mt-3 text-center text-xs text-text-subtle">Secure payment by Razorpay.</p>
          </Card>
        </div>
      )}
    </div>
  );
};
