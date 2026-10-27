import { useCallback, useEffect, useState } from 'react';
import { LIMITS, parseFeatureList, parsePlanInput } from '@ai-receptionist/contracts';
import { ArrowDown, ArrowUp, ListChecks, Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { ApiError, billingAdminApi, formatMoney, type Plan, type PlanFeature, type PlanInput } from '../api';
import { useToast } from '../toast';
import { ActiveBadge, Button, Card, Drawer, Field, INPUT, MONEY_INPUT_LENGTH, Toggle, cx, digitsFor, toMajor, toMinor } from '../ui';

type PlanForm = Omit<PlanInput, 'priceInr' | 'priceUsd' | 'setupFeeInr' | 'setupFeeUsd' | 'monthlyMinutes' | 'maxAgents' | 'maxConcurrentCalls' | 'sortOrder'> & {
  priceInr: string;
  priceUsd: string;
  setupFeeInr: string;
  setupFeeUsd: string;
  monthlyMinutes: string;
  maxAgents: string;
  maxConcurrentCalls: string;
  sortOrder: string;
};

const EMPTY_FORM: PlanForm = {
  slug: '', name: '', tagline: '', sortOrder: '100', isActive: true, isFeatured: false, contactSales: false,
  monthlyMinutes: '', priceInr: '', priceUsd: '', setupFeeInr: '', setupFeeUsd: '', maxAgents: '', maxConcurrentCalls: '', featureValues: {},
};

function toForm(plan: Plan): PlanForm {
  return {
    slug: plan.slug,
    name: plan.name,
    tagline: plan.tagline ?? '',
    sortOrder: String(plan.sort_order),
    isActive: plan.is_active,
    isFeatured: plan.is_featured,
    contactSales: plan.contact_sales,
    monthlyMinutes: plan.monthly_minutes?.toString() ?? '',
    priceInr: toMajor(plan.price_inr),
    priceUsd: toMajor(plan.price_usd),
    setupFeeInr: toMajor(plan.setup_fee_inr),
    setupFeeUsd: toMajor(plan.setup_fee_usd),
    maxAgents: plan.max_agents?.toString() ?? '',
    maxConcurrentCalls: plan.max_concurrent_calls?.toString() ?? '',
    featureValues: { ...plan.feature_values },
  };
}

const optionalInt = (value: string) => (value.trim() === '' ? null : Number(value));

function toInput(form: PlanForm): PlanInput {
  return {
    ...form,
    sortOrder: Number(form.sortOrder || 0),
    monthlyMinutes: optionalInt(form.monthlyMinutes),
    maxAgents: optionalInt(form.maxAgents),
    maxConcurrentCalls: optionalInt(form.maxConcurrentCalls),
    priceInr: toMinor(form.priceInr),
    priceUsd: toMinor(form.priceUsd),
    setupFeeInr: toMinor(form.setupFeeInr),
    setupFeeUsd: toMinor(form.setupFeeUsd),
  };
}

export function Plans({ roles }: { roles: string[] }) {
  const canEdit = roles.includes('super_admin');
  const toast = useToast();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [features, setFeatures] = useState<PlanFeature[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ plan: Plan | null } | null>(null);
  const [editingRows, setEditingRows] = useState(false);

  const load = useCallback(() => {
    billingAdminApi.plans()
      .then((data) => { setPlans(data.plans); setFeatures(data.features); setError(''); })
      .catch((err) => setError((err as Error).message));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Plans & pricing</h1>
          <p className="mt-1 text-sm text-subtle">What customers see on the pricing page and pay at checkout. Changes apply immediately to new checkouts; paid orders keep their price.</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditingRows(true)}><ListChecks className="h-4 w-4" /> Comparison rows</Button>
            <Button onClick={() => setEditing({ plan: null })}><Plus className="h-4 w-4" /> New plan</Button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl bg-danger-surface px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {!plans && !error && [0, 1, 2, 3].map((i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-surface" />)}
        {plans?.map((plan) => (
          <Card key={plan.id} className={cx('flex flex-col p-5', !plan.is_active && 'opacity-60')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold">{plan.name}</p>
                <p className="truncate text-xs text-subtle">/{plan.slug}</p>
              </div>
              <ActiveBadge active={plan.is_active} />
            </div>
            {plan.is_featured && <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-ink"><Sparkles className="h-3 w-3" /> Most popular</span>}

            <div className="mt-4 flex-1">
              {plan.contact_sales ? (
                <p className="font-display text-2xl font-bold">Talk to sales</p>
              ) : (
                <>
                  <p className="font-display text-2xl font-bold">{formatMoney(plan.price_inr, 'INR')}<span className="text-sm font-normal text-subtle"> /mo</span></p>
                  <p className="text-sm text-subtle">{plan.price_usd ? `${formatMoney(plan.price_usd, 'USD')} /mo` : 'No USD price'}</p>
                  <p className="mt-1 text-xs text-subtle">Setup {plan.setup_fee_inr ? formatMoney(plan.setup_fee_inr, 'INR') : '—'}{plan.setup_fee_usd ? ` · ${formatMoney(plan.setup_fee_usd, 'USD')}` : ''}</p>
                </>
              )}
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-subtle">Minutes</dt><dd>{plan.monthly_minutes?.toLocaleString('en-IN') ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-subtle">Agents</dt><dd>{plan.max_agents ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-subtle">Concurrent calls</dt><dd>{plan.max_concurrent_calls ?? '—'}</dd></div>
                {features.map((feature) => (
                  <div key={feature.key} className="flex justify-between gap-2"><dt className="truncate text-subtle">{feature.label}</dt><dd>{plan.feature_values[feature.key] || '—'}</dd></div>
                ))}
              </dl>
            </div>

            {canEdit && <Button variant="secondary" size="sm" className="mt-5" onClick={() => setEditing({ plan })}><Pencil className="h-3.5 w-3.5" /> Edit plan</Button>}
          </Card>
        ))}
      </div>

      {editing && (
        <PlanDrawer
          plan={editing.plan}
          features={features}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            load();
            toast({ tone: 'success', title: `${saved.name} saved`, description: 'The pricing page shows the change now.' });
          }}
        />
      )}
      {editingRows && (
        <RowsDrawer
          features={features}
          onClose={() => setEditingRows(false)}
          onSaved={() => { setEditingRows(false); load(); toast({ tone: 'success', title: 'Comparison rows saved' }); }}
        />
      )}
    </div>
  );
}

function PlanDrawer({ plan, features, onClose, onSaved }: { plan: Plan | null; features: PlanFeature[]; onClose: () => void; onSaved: (plan: Plan) => void }) {
  const [form, setForm] = useState<PlanForm>(plan ? toForm(plan) : EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  async function save() {
    setError('');
    const input = toInput(form);
    // Same rules as the API, so every problem shows next to its field before anything is sent.
    const check = parsePlanInput(input);
    if (!check.ok) {
      setErrors(check.errors);
      return setError('Please fix the highlighted fields.');
    }
    setErrors({});
    setBusy(true);
    try {
      const result = plan ? await billingAdminApi.updatePlan(plan.id, input) : await billingAdminApi.createPlan(input);
      onSaved(result.plan);
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError) setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  }

  const money = (key: 'priceInr' | 'priceUsd' | 'setupFeeInr' | 'setupFeeUsd', label: string, symbol: string) => (
    <Field label={label} error={errors[key]}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">{symbol}</span>
        <input className={cx(INPUT, 'pl-7')} inputMode="decimal" maxLength={MONEY_INPUT_LENGTH} value={form[key]} onChange={(e) => set(key, e.target.value)} aria-invalid={errors[key] ? true : undefined} />
      </div>
    </Field>
  );

  return (
    <Drawer
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      subtitle="Prices are per month; the setup fee is charged once, with the first month."
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save plan</Button>
      </>}
    >
      {error && <p role="alert" className="rounded-xl bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={errors.name}><input className={INPUT} minLength={LIMITS.planName.min} maxLength={LIMITS.planName.max} value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Slug" hint="(used in links)" error={errors.slug}>
          <input className={INPUT} minLength={LIMITS.planSlug.min} maxLength={LIMITS.planSlug.max} value={form.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} placeholder="ai-starter" />
        </Field>
      </div>
      <Field label="Tagline" error={errors.tagline}><input className={INPUT} maxLength={LIMITS.planTagline.max} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} /></Field>

      <div className="grid gap-2">
        <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Active" description="Shown on the pricing page and available at checkout." />
        <Toggle checked={form.isFeatured} onChange={(v) => set('isFeatured', v)} label="Most popular" description="Highlighted on the pricing page." />
        <Toggle checked={form.contactSales} onChange={(v) => set('contactSales', v)} label="Talk to sales" description="No price or checkout; the button opens the access request form." />
      </div>

      {!form.contactSales && (
        <div className="grid gap-4 sm:grid-cols-2">
          {money('priceInr', 'Price per month (INR)', '₹')}
          {money('priceUsd', 'Price per month (USD)', '$')}
          {money('setupFeeInr', 'One-time setup (INR)', '₹')}
          {money('setupFeeUsd', 'One-time setup (USD)', '$')}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Minutes / month" error={errors.monthlyMinutes}><input className={INPUT} inputMode="numeric" maxLength={digitsFor(LIMITS.planMinutes.max)} value={form.monthlyMinutes} onChange={(e) => set('monthlyMinutes', e.target.value)} /></Field>
        <Field label="Agents" error={errors.maxAgents}><input className={INPUT} inputMode="numeric" maxLength={digitsFor(LIMITS.planSeats.max)} value={form.maxAgents} onChange={(e) => set('maxAgents', e.target.value)} /></Field>
        <Field label="Concurrent calls" error={errors.maxConcurrentCalls}><input className={INPUT} inputMode="numeric" maxLength={digitsFor(LIMITS.planSeats.max)} value={form.maxConcurrentCalls} onChange={(e) => set('maxConcurrentCalls', e.target.value)} /></Field>
      </div>

      {features.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Comparison rows</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {features.map((feature) => (
              <Field key={feature.key} label={feature.label} error={errors[`featureValues.${feature.key}`]}>
                <input
                  className={INPUT}
                  maxLength={LIMITS.featureValue.max}
                  value={form.featureValues[feature.key] ?? ''}
                  onChange={(e) => set('featureValues', { ...form.featureValues, [feature.key]: e.target.value })}
                  placeholder="—"
                />
              </Field>
            ))}
          </div>
        </div>
      )}

      <Field label="Display order" hint="(lower first)" error={errors.sortOrder}>
        <input className={cx(INPUT, 'max-w-32')} inputMode="numeric" maxLength={digitsFor(LIMITS.planSortOrder.max)} value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
      </Field>
    </Drawer>
  );
}

function RowsDrawer({ features, onClose, onSaved }: { features: PlanFeature[]; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState(features.map(({ key, label }) => ({ key, label })));
  const [error, setError] = useState('');
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const move = (index: number, delta: number) => setRows((all) => {
    const next = [...all];
    const [row] = next.splice(index, 1);
    next.splice(index + delta, 0, row);
    return next;
  });

  async function save() {
    setError('');
    const check = parseFeatureList(rows);
    if (!check.ok) {
      setRowErrors(check.errors);
      return setError(check.errors.features ?? 'Please fix the highlighted rows, or remove empty ones.');
    }
    setRowErrors({});
    setBusy(true);
    try {
      await billingAdminApi.saveFeatures(rows);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="Comparison rows"
      subtitle="Extra rows in the pricing table (minutes, prices, agents, concurrent calls and setup fee are always shown). Fill in each plan's value from the plan editor."
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save rows</Button>
      </>}
    >
      {error && <p role="alert" className="rounded-xl bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.key || `new-${index}`}>
            <div className="flex items-center gap-2">
              <input
                className={INPUT}
                maxLength={LIMITS.featureLabel.max}
                value={row.label}
                aria-label={`Row ${index + 1} label`}
                aria-invalid={rowErrors[`features.${index}`] ? true : undefined}
                onChange={(e) => setRows((all) => all.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)))}
              />
              <Button variant="ghost" size="sm" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="sm" aria-label="Move down" disabled={index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="sm" aria-label="Remove row" onClick={() => setRows((all) => all.filter((_, i) => i !== index))}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
            {rowErrors[`features.${index}`] && <p className="mt-1 text-xs text-danger">{rowErrors[`features.${index}`]}</p>}
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="sm" disabled={rows.length >= LIMITS.featureRows.max} onClick={() => setRows((all) => [...all, { key: '', label: '' }])}><Plus className="h-3.5 w-3.5" /> Add row</Button>
      <p className="text-xs text-subtle">Removing a row hides it from the pricing table; values already entered on plans are kept and come back if you add the row again with the same name.</p>
    </Drawer>
  );
}
