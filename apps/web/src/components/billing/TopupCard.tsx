import { ArrowUpRight, Check, Clock3, Zap } from 'lucide-react';
import { formatMoney, type Currency } from '../../lib/billingApi';
import { Button } from '../ui/button';

/** A one-off minute pack, visually distinct from a monthly plan. */
export function TopupCard({ planName, minutes, amount, currency, expiry, preview = false, requiredPlanAmount, busy = false, onChoose }: {
  planName: string; minutes: number; amount: number; currency: Currency;
  expiry?: string; preview?: boolean; requiredPlanAmount?: number; busy?: boolean; onChoose: () => void;
}) {
  return <article className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-primary/20 bg-surface shadow-card">
    <div className="flex items-center justify-between gap-3 border-b border-primary/10 bg-primary/5 px-5 py-3">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><Zap size={14} />Minute top-up</span>
      <span className="rounded-full border border-primary/15 bg-surface px-2 py-1 text-[11px] text-text-subtle">One-time</span>
    </div>
    <div className="flex flex-1 flex-col p-5">
      <p className="break-words font-display text-lg font-semibold">{planName}</p>
      <div className="my-5 flex items-baseline gap-2"><span className="font-display text-5xl font-semibold tracking-tight text-primary">+{minutes.toLocaleString('en-IN')}</span><span className="text-sm text-text-subtle">minutes</span></div>
      <p className="text-2xl font-semibold tracking-tight">{formatMoney(amount, currency)}<span className="ml-1.5 text-xs font-normal text-text-subtle">per pack</span></p>
      <ul className="my-5 flex-1 space-y-2.5 text-xs leading-relaxed text-text-subtle">
        <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-primary" />Adds to your existing calling balance</li>
        <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-primary" />Shared by all your receptionists</li>
        <li className="flex items-start gap-2"><Clock3 size={14} className="mt-0.5 shrink-0 text-primary" />{expiry ? `Expires ${expiry}` : 'Expires with the active paid plan'}</li>
      </ul>
      {preview && <p className="mb-3 rounded-lg bg-background px-3 py-2 text-xs leading-relaxed text-text-subtle">Requires an active {planName} subscription{requiredPlanAmount != null ? ` at ${formatMoney(requiredPlanAmount, currency)}/month` : ''}. The pack price above is for extra minutes only, purchased separately after plan activation.</p>}
      <Button disabled={busy} variant={preview ? 'secondary' : 'primary'} className="w-full" onClick={onChoose}>{preview ? 'View monthly plan' : 'Buy extra minutes'}<ArrowUpRight size={15} /></Button>
    </div>
  </article>;
}
