import { Check } from 'lucide-react';
import { Button } from '../ui/button';
import { formatMoney, type Currency, type PlanFeature, type PublicPlan } from '../../lib/billingApi';

/** Same catalogue card for public pricing and signed-in billing. */
export function PlanCard({ plan, currency, features, existingCustomer = false, current = false, busy = false, onChoose }: {
  plan: PublicPlan; currency: Currency; features: PlanFeature[];
  existingCustomer?: boolean; current?: boolean; busy?: boolean; onChoose: () => void;
}) {
  const priced = plan.price[currency] > 0;
  const muted = plan.featured ? 'text-primary-foreground/75' : 'text-text-subtle';
  const count = (value: number | null) => value == null ? 'Custom' : value.toLocaleString('en-IN');
  const planFeatures = features.filter(feature => !feature.key.startsWith('topup_'));
  return <article className={`relative flex min-w-0 flex-col rounded-large border p-5 ${plan.featured ? 'border-text bg-text text-primary-foreground shadow-floating' : 'border-border bg-surface text-text shadow-card'}`}>
    {plan.featured && <span className="absolute -top-3 left-6 rounded-pill bg-accent-lime px-3 py-1 text-xs font-bold uppercase tracking-wider text-text">Most popular</span>}
    <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-semibold tracking-[-0.03em]">{plan.name}</h2>{current && <span className={`rounded-full border px-2 py-0.5 text-xs ${plan.featured ? 'border-white/25' : 'border-primary/25 text-primary'}`}>Current</span>}</div>
    {plan.tagline && <p className={`mt-1 text-sm ${muted}`}>{plan.tagline}</p>}
    <div className="mt-4 min-h-[4rem]">
      {plan.contactSales ? <p className="font-display text-3xl font-semibold tracking-tight">Let’s talk</p> : priced ? <>
        <p className="font-display text-4xl font-semibold tracking-[-0.04em]">{formatMoney(plan.price[currency], currency)}<span className={`ml-1 text-base font-normal ${muted}`}>/month</span></p>
        <p className={`mt-1 text-sm ${muted}`}>{existingCustomer ? 'No additional setup fee' : plan.setupFee[currency] > 0 ? `+ ${formatMoney(plan.setupFee[currency], currency)} one-time setup` : 'No setup fee'}</p>
      </> : <p className="text-sm">Not available in {currency}.</p>}
    </div>
    <div className="mt-4 flex-1">
      <ul className="space-y-2 text-sm">{[`${count(plan.monthlyMinutes)} minutes every month`, `${count(plan.maxAgents)} AI agents`, `${count(plan.maxConcurrentCalls)} concurrent calls`].map(line => <li key={line} className="flex items-start gap-2.5"><Check aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${plan.featured ? 'text-accent-lime' : 'text-primary'}`} />{line}</li>)}</ul>
      {planFeatures.length > 0 && <dl className={`mt-3 divide-y border-t text-sm ${plan.featured ? 'divide-primary-foreground/15 border-primary-foreground/15' : 'divide-border border-border'}`}>
        {planFeatures.map(feature => <div key={feature.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-start gap-3 py-2"><dt className={`break-words ${muted}`}>{feature.label}</dt><dd className="max-w-28 whitespace-pre-line break-words text-right font-medium">{plan.features[feature.key] || '—'}</dd></div>)}
      </dl>}
    </div>
    <Button className={`mt-4 w-full ${plan.featured ? 'bg-accent-lime text-text hover:bg-white' : ''}`} variant={plan.featured ? 'primary' : 'secondary'} disabled={busy || (!plan.contactSales && !priced)} onClick={onChoose}>{plan.contactSales ? 'Talk to sales ↗' : current ? 'Restart for a fresh month ↗' : existingCustomer ? 'Change plan ↗' : 'Choose plan ↗'}</Button>
  </article>;
}
