import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
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

  useEffect(() => {
    billingApi.plans()
      .then((data) => { setPlans(data.plans); setFeatures(data.features); })
      .catch((err) => setError((err as Error).message));
  }, []);

  const choose = (plan: PublicPlan) => {
    if (plan.contactSales) navigate('/request-access');
    else navigate(`/checkout?plan=${encodeURIComponent(plan.slug)}&currency=${currency}`);
  };

  const priced = (plan: PublicPlan) => !plan.contactSales && plan.price[currency] > 0;

  const rows: Array<{ label: string; value: (plan: PublicPlan) => string }> = [
    { label: 'Monthly usage', value: (p) => p.contactSales ? 'Custom' : count(p.monthlyMinutes, ' minutes') },
    { label: 'Price per month', value: (p) => p.contactSales ? 'Talk to sales' : priced(p) ? formatMoney(p.price[currency], currency) : '—' },
    { label: 'Agents', value: (p) => p.contactSales ? 'Custom' : count(p.maxAgents) },
    { label: 'Concurrent calls', value: (p) => p.contactSales ? 'Custom' : count(p.maxConcurrentCalls) },
    ...features.map((feature) => ({ label: feature.label, value: (p: PublicPlan) => p.features[feature.key] || '—' })),
    { label: 'One-time setup fee', value: (p) => p.contactSales ? '—' : p.setupFee[currency] > 0 ? formatMoney(p.setupFee[currency], currency) : 'Included' },
  ];

  return (
    <div className="flex-1 bg-background py-14 sm:py-20">
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

        {error && <p role="alert" className="mx-auto mt-10 max-w-md rounded-medium bg-danger-surface px-4 py-3 text-center text-sm text-danger">{error}</p>}

        <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {!plans && !error && [0, 1, 2, 3].map((i) => <div key={i} className="h-96 animate-pulse rounded-large bg-surface-sunken" />)}
          {plans?.map((plan) => (
            <article
              key={plan.slug}
              className={`relative flex flex-col rounded-large border p-6 ${plan.featured ? 'border-text bg-text text-primary-foreground shadow-floating' : 'border-border bg-surface shadow-card'}`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-6 rounded-pill bg-accent-lime px-3 py-1 text-xs font-bold uppercase tracking-wider text-text">Most popular</span>
              )}
              <h2 className="font-display text-xl font-semibold tracking-[-0.03em]">{plan.name}</h2>
              {plan.tagline && <p className={`mt-1 text-sm ${plan.featured ? 'text-primary-foreground/75' : 'text-text-subtle'}`}>{plan.tagline}</p>}

              <div className="mt-6 min-h-[5.5rem]">
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

              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {(plan.contactSales
                  ? ['Custom monthly minutes', 'Custom agents and concurrency', 'Dedicated onboarding and support']
                  : [
                      `${count(plan.monthlyMinutes)} minutes every month`,
                      `${count(plan.maxAgents)} AI agents`,
                      `${count(plan.maxConcurrentCalls)} concurrent calls`,
                    ]).map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${plan.featured ? 'text-accent-lime' : 'text-primary'}`} aria-hidden="true" />
                    {line}
                  </li>
                ))}
              </ul>

              <Button
                className={`mt-8 w-full ${plan.featured ? 'bg-accent-lime text-text hover:bg-white' : ''}`}
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
          <section className="mt-16" aria-labelledby="compare-heading">
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
