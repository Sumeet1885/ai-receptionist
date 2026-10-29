import { openSupport } from '../../lib/supportDrawer';
import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Container } from '../ui/layout';
import { billingApi, formatMoney, type Currency, type PlanFeature, type PublicPlan } from '../../lib/billingApi';

interface PricingViewProps {
  navigate: (path: string) => void;
  embedded?: boolean;
}

function count(value: number | null, unit = '') {
  return value === null || value === undefined ? '—' : `${value.toLocaleString('en-IN')}${unit}`;
}

export const PricingView: React.FC<PricingViewProps> = ({ navigate, embedded = false }) => {
  const [currency, setCurrency] = useState<Currency>('INR');
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [features, setFeatures] = useState<PlanFeature[]>([]);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    billingApi.plans()
      .then((data) => { setPlans(data.plans); setFeatures(data.features); setError(''); })
      .catch((err) => setError((err as Error).message));
  }, [reload]);

  const choose = (plan: PublicPlan) => {
    if (plan.contactSales) openSupport({ view: 'new', intent: 'sales' });
    else navigate(`/checkout?plan=${encodeURIComponent(plan.slug)}&currency=${currency}`);
  };

  const priced = (plan: PublicPlan) => !plan.contactSales && plan.price[currency] > 0;

  function getFeatureLabel(feature: PlanFeature, curr: Currency) {
    if (feature.key === 'topup_500_minutes') {
      return curr === 'USD' ? 'Top up Minutes 500 ($)' : 'Top up Minutes 500 (₹)';
    }
    if (feature.key === 'calendar_booking') {
      return curr === 'USD' ? 'Calendar booking' : feature.label;
    }
    return feature.label.replace(/\(INR\)/gi, curr === 'USD' ? '($)' : '(₹)');
  }

  function getFeatureValue(p: PublicPlan, featureKey: string, curr: Currency) {
    if (featureKey === 'topup_500_minutes') {
      if (curr === 'USD') {
        const usdVal = p.features['topup_500_minutes_usd'];
        if (usdVal) return `$${usdVal}`;
        if (p.slug === 'ai-starter') return '$50';
        if (p.slug === 'ai-growth') return '$45';
        if (p.slug === 'ai-business-pro') return '$38';
        return p.contactSales ? 'Custom' : '—';
      } else {
        const inrVal = p.features['topup_500_minutes'];
        if (!inrVal) return p.contactSales ? 'Custom' : '—';
        const num = parseInt(inrVal, 10);
        return !isNaN(num) ? `₹${num.toLocaleString('en-IN')}` : inrVal;
      }
    }
    return p.features[featureKey] || '—';
  }

  const rows: Array<{ label: string; value: (plan: PublicPlan) => string }> = [
    { label: 'Monthly usage', value: (p) => p.contactSales && p.monthlyMinutes == null ? 'Custom' : count(p.monthlyMinutes, ' minutes') },
    { label: 'Price per month', value: (p) => p.contactSales ? 'Talk to sales' : priced(p) ? formatMoney(p.price[currency], currency) : '—' },
    { label: 'Agents', value: (p) => p.contactSales && p.maxAgents == null ? 'Custom' : count(p.maxAgents) },
    { label: 'Concurrent calls', value: (p) => p.contactSales && p.maxConcurrentCalls == null ? 'Custom' : count(p.maxConcurrentCalls) },
    ...features.map((feature) => ({
      label: getFeatureLabel(feature, currency),
      value: (p: PublicPlan) => getFeatureValue(p, feature.key, currency),
    })),
    { label: 'One-time setup fee', value: (p) => p.contactSales ? '—' : p.setupFee[currency] > 0 ? formatMoney(p.setupFee[currency], currency) : 'Included' },
  ];

  const content = (
    <>
      <div className={embedded ? "flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2" : "mx-auto max-w-2xl text-center"}>
        {embedded ? (
          <div>
            <h3 className="font-display font-extrabold text-brand-text text-xl sm:text-2xl">
              Available Subscription Plans
            </h3>
            <p className="text-xs sm:text-sm text-brand-muted mt-1 font-sans">
              Choose your voice plan or scale up monthly calling minutes with instant Razorpay activation.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-subtle">Pricing</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] text-text sm:text-5xl">
              Plans for every <em className="font-accent font-normal italic">business voice.</em>
            </h1>
            <p className="mt-4 text-base text-text-subtle">Pick the minutes you need. Every plan includes your AI receptionist, lead capture and transcripts.</p>
          </>
        )}

        <div className={`${embedded ? "self-start sm:self-auto" : "mt-8"} inline-flex rounded-pill border border-border bg-surface p-1`} role="radiogroup" aria-label="Currency">
          {(['INR', 'USD'] as Currency[]).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={currency === option}
              onClick={() => setCurrency(option)}
              className={`rounded-pill px-4 py-1.5 text-xs font-semibold transition-colors ${currency === option ? 'bg-text text-primary-foreground' : 'text-text-subtle hover:text-text'}`}
            >
              {option === 'INR' ? '₹ India' : '$ International'}
            </button>
          ))}
        </div>
      </div>

        {error && (
          <div role="alert" className="mx-auto mt-10 max-w-md rounded-medium bg-danger-surface px-4 py-4 text-center text-sm text-danger">
            <p className="font-semibold">We could not load our plans</p>
            <p className="mt-1">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => { setError(''); setReload((n) => n + 1); }}>Try again</Button>
          </div>
        )}

        <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {!plans && !error && [0, 1, 2, 3].map((i) => <div key={i} className="h-96 animate-pulse rounded-large bg-surface-sunken" />)}
          {plans?.map((plan) => (
            <article
              key={plan.slug}
              className={`relative flex flex-col rounded-large border p-5 ${plan.featured ? 'border-text bg-text text-primary-foreground shadow-floating' : 'border-border bg-surface shadow-card'}`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-6 rounded-pill bg-accent-lime px-3 py-1 text-xs font-bold uppercase tracking-wider text-text">Most popular</span>
              )}
              <h2 className="font-display text-xl font-semibold tracking-[-0.03em]">{plan.name}</h2>
              {plan.tagline && <p className={`mt-1 text-sm ${plan.featured ? 'text-primary-foreground/75' : 'text-text-subtle'}`}>{plan.tagline}</p>}

              <div className="mt-4 min-h-[4rem]">
                {plan.contactSales ? (
                  <p className="font-display text-3xl font-semibold tracking-[-0.03em]">Let&rsquo;s talk</p>
                ) : priced(plan) ? (
                  <>
                    <p className="font-display text-4xl font-semibold tracking-[-0.04em]">
                      {formatMoney(plan.price[currency], currency)}
                      <span className={`ml-1 text-base font-normal ${plan.featured ? 'text-primary-foreground/70' : 'text-text-subtle'}`}>/month</span>
                    </p>
                    <p className={`mt-1 text-sm ${plan.featured ? 'text-primary-foreground/70' : 'text-text-subtle'}`}>
                      {plan.setupFee[currency] > 0 ? `+ ${formatMoney(plan.setupFee[currency], currency)} one-time setup` : 'No setup fee'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm">Not available in {currency}.</p>
                )}
              </div>

              <div className="mt-4 flex-1">
              <ul className="space-y-2 text-sm">
                {[
                  plan.contactSales && plan.monthlyMinutes == null ? 'Custom monthly minutes' : `${count(plan.monthlyMinutes)} minutes every month`,
                  plan.contactSales && plan.maxAgents == null ? 'Custom AI agents' : `${count(plan.maxAgents)} AI agents`,
                  plan.contactSales && plan.maxConcurrentCalls == null ? 'Custom concurrent calls' : `${count(plan.maxConcurrentCalls)} concurrent calls`,
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${plan.featured ? 'text-accent-lime' : 'text-primary'}`} aria-hidden="true" />
                    {line}
                  </li>
                ))}
              </ul>
              {features.length > 0 && (
                <dl className={`mt-3 divide-y border-t text-sm ${plan.featured ? 'divide-primary-foreground/15 border-primary-foreground/15' : 'divide-border border-border'}`}>
                  {features.map((feature) => (
                    <div key={feature.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-start gap-3 py-2">
                      <dt className={`break-words ${plan.featured ? 'text-primary-foreground/75' : 'text-text-subtle'}`}>{getFeatureLabel(feature, currency)}</dt>
                      <dd className="max-w-28 break-words text-right font-medium whitespace-pre-line">{getFeatureValue(plan, feature.key, currency)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              </div>

              <Button
                className={`mt-4 w-full ${plan.featured ? 'bg-accent-lime text-text hover:bg-white' : ''}`}
                variant={plan.featured ? 'primary' : 'secondary'}
                disabled={!plan.contactSales && !priced(plan)}
                onClick={() => choose(plan)}
              >
                {plan.contactSales ? 'Talk to sales ↗' : 'Choose plan ↗'}
              </Button>
            </article>
          ))}
        </div>

        {plans && plans.length > 0 && (
          <section className="mt-10" aria-labelledby="compare-heading">
            <h2 id="compare-heading" className="text-center font-display text-2xl font-semibold tracking-[-0.03em] text-text">Compare plans</h2>
            <div className="mt-6 overflow-x-auto rounded-large border border-border bg-surface shadow-card">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="px-5 py-4 font-medium text-text-subtle">&nbsp;</th>
                    {plans.map((plan) => (
                      <th key={plan.slug} scope="col" className="px-5 py-4 font-display text-base font-semibold text-text">{plan.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label} className="border-b border-border last:border-0">
                      <th scope="row" className="px-5 py-3.5 font-medium text-text">{row.label}</th>
                      {plans.map((plan) => (
                        <td key={plan.slug} className="px-5 py-3.5 text-text-subtle">{row.value(plan)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
    </>
  );

  if (embedded) {
    return <div className="space-y-6 pt-2">{content}</div>;
  }

  return (
    <div className="flex-1 bg-background py-14 sm:py-20">
      <Container>
        {content}
      </Container>
    </div>
  );
};
