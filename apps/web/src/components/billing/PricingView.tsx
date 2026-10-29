import { openSupport } from '../../lib/supportDrawer';
import { publicTexture } from '../../lib/publicTexture';
import React, { useEffect, useState } from 'react';
import { PlanCard } from './PlanCard';
import { Button } from '../ui/button';
import { Container } from '../ui/layout';
import { billingApi, formatMoney, type Currency, type PlanFeature, type PublicPlan } from '../../lib/billingApi';

interface PricingViewProps {
  navigate: (path: string) => void;
}

function count(value: number | null, unit = '') {
  return value === null || value === undefined ? '—' : `${value.toLocaleString('en-IN')}${unit}`;
}

export const PricingView: React.FC<PricingViewProps> = ({ navigate }) => {
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

  const rows: Array<{ label: string; value: (plan: PublicPlan) => string }> = [
    { label: 'Monthly usage', value: (p) => p.contactSales && p.monthlyMinutes == null ? 'Custom' : count(p.monthlyMinutes, ' minutes') },
    { label: 'Price per month', value: (p) => p.contactSales ? 'Talk to sales' : priced(p) ? formatMoney(p.price[currency], currency) : '—' },
    { label: 'Agents', value: (p) => p.contactSales && p.maxAgents == null ? 'Custom' : count(p.maxAgents) },
    { label: 'Concurrent calls', value: (p) => p.contactSales && p.maxConcurrentCalls == null ? 'Custom' : count(p.maxConcurrentCalls) },
    ...features.filter(feature => !feature.key.startsWith('topup_')).map((feature) => ({ label: feature.label, value: (p: PublicPlan) => p.features[feature.key] || '—' })),
    { label: 'One-time setup fee', value: (p) => p.contactSales ? '—' : p.setupFee[currency] > 0 ? formatMoney(p.setupFee[currency], currency) : 'Included' },
  ];

  return (
    <div style={publicTexture('ajrakh')} className="flex-1 bg-background py-14 sm:py-20">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-subtle">Pricing</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] text-text sm:text-5xl">
            Plans for every <em className="font-accent font-normal italic">business voice.</em>
          </h1>
          <p className="mt-4 text-base text-text-subtle">Pick the minutes you need. Every plan includes your AI receptionist, lead capture and transcripts.</p>

          <div className="mt-8 inline-flex rounded-pill border border-border bg-surface p-1" role="radiogroup" aria-label="Currency">
            {(['INR', 'USD'] as Currency[]).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={currency === option}
                onClick={() => setCurrency(option)}
                className={`rounded-pill px-5 py-2 text-sm font-semibold transition-colors ${currency === option ? 'bg-text text-primary-foreground' : 'text-text-subtle hover:text-text'}`}
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
          {plans?.map(plan => <PlanCard key={plan.slug} plan={plan} currency={currency} features={features} onChoose={() => choose(plan)} />)}
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
      </Container>
    </div>
  );
};
