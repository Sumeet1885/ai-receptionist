import { useCallback, useEffect, useState } from 'react';
import { LIMITS, parseCouponInput } from '@ai-receptionist/contracts';
import { Loader2, Pencil, Plus, TicketPercent } from 'lucide-react';
import { ApiError, billingAdminApi, formatMoney, type Coupon, type CouponInput, type Plan } from '../api';
import { useToast } from '../toast';
import { ActiveBadge, Button, Card, Drawer, Field, INPUT, MONEY_INPUT_LENGTH, PageError, Toggle, cx, digitsFor, formatDate, toMajor, toMinor } from '../ui';

const APPLIES_TO_LABELS: Record<Coupon['applies_to'], string> = {
  total: 'Whole order',
  plan: 'First month only',
  setup: 'Setup fee only',
};

type CouponForm = {
  code: string;
  description: string;
  discountType: 'percent' | 'fixed';
  percentOff: string;
  amountOffInr: string;
  amountOffUsd: string;
  appliesTo: Coupon['applies_to'];
  planIds: string[];
  maxRedemptions: string;
  startsOn: string;
  expiresOn: string;
  isActive: boolean;
};

const EMPTY_FORM: CouponForm = {
  code: '', description: '', discountType: 'percent', percentOff: '', amountOffInr: '', amountOffUsd: '',
  appliesTo: 'total', planIds: [], maxRedemptions: '', startsOn: '', expiresOn: '', isActive: true,
};

// <input type="date"> works in local days; the API stores instants.
const toDay = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const startOfDay = (day: string) => (day ? new Date(`${day}T00:00:00`).toISOString() : null);
const endOfDay = (day: string) => (day ? new Date(`${day}T23:59:59`).toISOString() : null);

function toForm(coupon: Coupon): CouponForm {
  return {
    code: coupon.code,
    description: coupon.description ?? '',
    discountType: coupon.discount_type,
    percentOff: coupon.percent_off === null ? '' : String(Number(coupon.percent_off)),
    amountOffInr: toMajor(coupon.amount_off_inr),
    amountOffUsd: toMajor(coupon.amount_off_usd),
    appliesTo: coupon.applies_to,
    planIds: coupon.plan_ids,
    maxRedemptions: coupon.max_redemptions?.toString() ?? '',
    startsOn: toDay(coupon.starts_at),
    expiresOn: toDay(coupon.expires_at),
    isActive: coupon.is_active,
  };
}

function toInput(form: CouponForm, existing: Coupon | null): CouponInput {
  const percent = form.discountType === 'percent';
  return {
    code: form.code.trim().toUpperCase(),
    description: form.description,
    discountType: form.discountType,
    percentOff: percent && form.percentOff.trim() ? Number(form.percentOff) : null,
    amountOffInr: !percent && form.amountOffInr.trim() ? toMinor(form.amountOffInr) : null,
    amountOffUsd: !percent && form.amountOffUsd.trim() ? toMinor(form.amountOffUsd) : null,
    appliesTo: form.appliesTo,
    planIds: form.planIds,
    maxRedemptions: form.maxRedemptions.trim() ? Number(form.maxRedemptions) : null,
    // Keep the exact original start when the day wasn't changed.
    startsAt: existing && form.startsOn === toDay(existing.starts_at) ? existing.starts_at : startOfDay(form.startsOn),
    expiresAt: endOfDay(form.expiresOn),
    isActive: form.isActive,
  };
}

function discountLabel(coupon: Coupon) {
  if (coupon.discount_type === 'percent') return `${Number(coupon.percent_off)}% off`;
  const parts = [
    coupon.amount_off_inr ? formatMoney(coupon.amount_off_inr, 'INR') : null,
    coupon.amount_off_usd ? formatMoney(coupon.amount_off_usd, 'USD') : null,
  ].filter(Boolean);
  return `${parts.join(' / ')} off`;
}

function couponState(coupon: Coupon) {
  const now = Date.now();
  if (!coupon.is_active) return { label: 'Off', tone: 'off' as const };
  if (Date.parse(coupon.starts_at) > now) return { label: 'Scheduled', tone: 'info' as const };
  if (coupon.expires_at && Date.parse(coupon.expires_at) <= now) return { label: 'Expired', tone: 'off' as const };
  if (coupon.max_redemptions !== null && coupon.redemption_count >= coupon.max_redemptions) return { label: 'Used up', tone: 'off' as const };
  return { label: 'Active', tone: 'on' as const };
}

export function Coupons({ roles }: { roles: string[] }) {
  const canEdit = roles.includes('super_admin');
  const toast = useToast();
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ coupon: Coupon | null } | null>(null);

  const load = useCallback(() => {
    Promise.all([billingAdminApi.coupons(), billingAdminApi.plans()])
      .then(([couponData, planData]) => { setCoupons(couponData.coupons); setPlans(planData.plans); setError(''); })
      .catch((err) => setError((err as Error).message));
  }, []);
  useEffect(load, [load]);

  const planName = (id: string) => plans.find((plan) => plan.id === id)?.name ?? 'Removed plan';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Coupons</h1>
          <p className="mt-1 text-sm text-subtle">Codes customers can enter at checkout. Discounts never take an order below the payment minimum.</p>
        </div>
        {canEdit && <Button onClick={() => setEditing({ coupon: null })}><Plus className="h-4 w-4" /> New coupon</Button>}
      </div>

      {error && <PageError message={error} onRetry={load} />}

      <Card className="overflow-hidden">
        {!coupons && !error && <div className="flex h-40 items-center justify-center text-subtle"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {coupons?.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <TicketPercent className="h-8 w-8 text-subtle" />
            <p className="font-semibold">No coupons yet</p>
            <p className="text-sm text-subtle">Create one to offer launch or partner discounts.</p>
          </div>
        )}
        {coupons && coupons.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-background/60 text-left text-xs uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Discount</th>
                  <th className="px-4 py-3 font-semibold">Plans</th>
                  <th className="px-4 py-3 font-semibold">Used</th>
                  <th className="px-4 py-3 font-semibold">Valid until</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {canEdit && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {coupons.map((coupon) => {
                  const state = couponState(coupon);
                  return (
                    <tr key={coupon.id} className="hover:bg-background/50">
                      <td className="px-4 py-3">
                        <p className="font-mono font-semibold">{coupon.code}</p>
                        {coupon.description && <p className="max-w-56 truncate text-xs text-subtle">{coupon.description}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{discountLabel(coupon)}</p>
                        <p className="text-xs text-subtle">{APPLIES_TO_LABELS[coupon.applies_to]}</p>
                      </td>
                      <td className="px-4 py-3 text-subtle">{coupon.plan_ids.length ? coupon.plan_ids.map(planName).join(', ') : 'All plans'}</td>
                      <td className="px-4 py-3 tabular-nums">{coupon.redemption_count}{coupon.max_redemptions !== null && <span className="text-subtle"> / {coupon.max_redemptions}</span>}</td>
                      <td className="px-4 py-3 text-subtle">{coupon.expires_at ? formatDate(coupon.expires_at) : 'No end date'}</td>
                      <td className="px-4 py-3">
                        {state.tone === 'on' ? <ActiveBadge active /> : (
                          <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', state.tone === 'info' ? 'bg-info-surface text-info' : 'bg-background text-subtle')}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />{state.label}
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setEditing({ coupon })}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <CouponDrawer
          coupon={editing.coupon}
          plans={plans.filter((plan) => !plan.contact_sales)}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            load();
            toast({ tone: 'success', title: `Coupon ${saved.code} saved` });
          }}
        />
      )}
    </div>
  );
}

function CouponDrawer({ coupon, plans, onClose, onSaved }: { coupon: Coupon | null; plans: Plan[]; onClose: () => void; onSaved: (coupon: Coupon) => void }) {
  const [form, setForm] = useState<CouponForm>(coupon ? toForm(coupon) : EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CouponForm>(key: K, value: CouponForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  async function save() {
    setError('');
    const input = toInput(form, coupon);
    // Same rules as the API, so every problem shows next to its field before anything is sent.
    const check = parseCouponInput(input);
    if (!check.ok) {
      setErrors(check.errors);
      return setError('Please fix the highlighted fields.');
    }
    setErrors({});
    setBusy(true);
    try {
      const result = coupon ? await billingAdminApi.updateCoupon(coupon.id, input) : await billingAdminApi.createCoupon(input);
      onSaved(result.coupon);
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError) setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  }

  const togglePlan = (id: string) => set('planIds', form.planIds.includes(id) ? form.planIds.filter((p) => p !== id) : [...form.planIds, id]);

  return (
    <Drawer
      title={coupon ? `Edit ${coupon.code}` : 'New coupon'}
      subtitle={coupon ? `Redeemed ${coupon.redemption_count} time${coupon.redemption_count === 1 ? '' : 's'}.` : 'Customers type the code at checkout.'}
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save coupon</Button>
      </>}
    >
      {error && <p role="alert" className="rounded-xl bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" hint="(3–32: A–Z, 0–9, - or _)" error={errors.code}>
          <input className={cx(INPUT, 'font-mono uppercase')} minLength={LIMITS.couponCode.min} maxLength={LIMITS.couponCode.max} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="LAUNCH20" />
        </Field>
        <Field label="Usage limit" hint="(blank = unlimited)" error={errors.maxRedemptions}>
          <input className={INPUT} inputMode="numeric" maxLength={digitsFor(LIMITS.couponRedemptions.max)} value={form.maxRedemptions} onChange={(e) => set('maxRedemptions', e.target.value)} />
        </Field>
      </div>
      <Field label="Internal note" error={errors.description}>
        <input className={INPUT} maxLength={LIMITS.couponDescription.max} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Diwali campaign" />
      </Field>

      <div className="space-y-3 rounded-2xl border border-line p-4">
        <div className="inline-flex rounded-xl bg-background p-1" role="radiogroup" aria-label="Discount type">
          {(['percent', 'fixed'] as const).map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={form.discountType === type}
              onClick={() => set('discountType', type)}
              className={cx('cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold', form.discountType === type ? 'bg-surface text-ink shadow-sm' : 'text-subtle')}
            >
              {type === 'percent' ? 'Percentage' : 'Fixed amount'}
            </button>
          ))}
        </div>
        {form.discountType === 'percent' ? (
          <Field label="Percent off" error={errors.percentOff}>
            <input className={cx(INPUT, 'max-w-40')} inputMode="decimal" maxLength={6} value={form.percentOff} onChange={(e) => set('percentOff', e.target.value)} placeholder="20" />
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount off (INR)" error={errors.amountOffInr}>
              <input className={INPUT} inputMode="decimal" maxLength={MONEY_INPUT_LENGTH} value={form.amountOffInr} onChange={(e) => set('amountOffInr', e.target.value)} placeholder="₹" />
            </Field>
            <Field label="Amount off (USD)" error={errors.amountOffUsd}>
              <input className={INPUT} inputMode="decimal" maxLength={MONEY_INPUT_LENGTH} value={form.amountOffUsd} onChange={(e) => set('amountOffUsd', e.target.value)} placeholder="$" />
            </Field>
          </div>
        )}
        <Field label="Applies to" error={errors.appliesTo}>
          <select className={INPUT} value={form.appliesTo} onChange={(e) => set('appliesTo', e.target.value as Coupon['applies_to'])}>
            {(Object.keys(APPLIES_TO_LABELS) as Array<Coupon['applies_to']>).map((key) => <option key={key} value={key}>{APPLIES_TO_LABELS[key]}</option>)}
          </select>
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink">Plans <span className="font-normal text-subtle">(none selected = every plan)</span></p>
        <div className="flex flex-wrap gap-2">
          {plans.map((plan) => {
            const on = form.planIds.includes(plan.id);
            return (
              <button
                key={plan.id}
                type="button"
                aria-pressed={on}
                onClick={() => togglePlan(plan.id)}
                className={cx('cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors', on ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-white text-subtle hover:text-ink')}
              >
                {plan.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" hint="(blank = now)" error={errors.startsAt}>
          <input type="date" className={INPUT} value={form.startsOn} onChange={(e) => set('startsOn', e.target.value)} />
        </Field>
        <Field label="Ends" hint="(blank = never)" error={errors.expiresAt}>
          <input type="date" className={INPUT} value={form.expiresOn} onChange={(e) => set('expiresOn', e.target.value)} />
        </Field>
      </div>

      <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Active" description="Turn off to stop new checkouts using this code." />
    </Drawer>
  );
}
