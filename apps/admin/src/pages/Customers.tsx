import { formatExpiryIST } from '@ai-receptionist/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { Activity, Ban, Bot, Check, CreditCard, Edit2, Loader2, Mail, Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, Plus, RotateCcw, Search, Trash2, UserMinus, Users, X } from 'lucide-react';
import { LIMITS } from '@ai-receptionist/contracts';
import { customersApi, billingAdminApi, type Customer, type CustomerStage, type BotSummary, type CustomerAgentsResponse, type Plan, type CustomerUsage } from '../api';
import { useToast } from '../toast';
import { Button, Card, Drawer, FilterTabs, PageError, Pager, cx, formatDate, initials, timeAgo } from '../ui';

// Customer workspaces (ezeebzee's "Tenants"): who has a login, where they are in setup, their
// plan, and the actions support needs.

const STAGE: Record<CustomerStage, { label: string; style: string }> = {
  scheduled: { label: 'Scheduled', style: 'bg-info-surface text-info' },
  payment_required: { label: 'Payment required', style: 'bg-warning-surface text-warning' },
  active: { label: 'Active', style: 'bg-success-surface text-success' },
  onboarding: { label: 'Onboarding', style: 'bg-info-surface text-info' },
  set_password: { label: 'Setting password', style: 'bg-warning-surface text-warning' },
  verify_email: { label: 'Awaiting email', style: 'bg-warning-surface text-warning' },
  suspended: { label: 'Suspended', style: 'bg-background text-subtle' },
};

const SOURCE: Record<Customer['source'], string> = {
  paid: 'Paid signup',
  access_request: 'Approved request',
  existing: 'Before gated access',
};

type Counts = Record<'all' | CustomerStage, number>;

export function Customers({ roles }: { roles: string[] }) {
  const toast = useToast();
  const canSupport = roles.includes('super_admin') || roles.includes('support');
  const [syncingDograh, setSyncingDograh] = useState(false);
  const [stage, setStage] = useState<CustomerStage | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: Customer[]; total: number; pageSize: number; counts: Counts } | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Customer | null>(null);

  const handleSyncDograh = async () => {
    setSyncingDograh(true);
    try {
      const res = await customersApi.syncDograh();
      toast({
        tone: 'success',
        title: res.createdCount > 0
          ? `Synced from Dograh: ${res.createdCount} new persona(s) imported!`
          : (res.updatedCount > 0 ? `Synced from Dograh: ${res.updatedCount} persona(s) updated with phone lines.` : 'Synced from Dograh: All workflows are up to date.'),
      });
      setReload((n) => n + 1);
    } catch (err: any) {
      toast({ tone: 'error', title: 'Dograh sync failed: ' + (err.message || 'Unknown error') });
    } finally {
      setSyncingDograh(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    customersApi.list({ stage, search: applied, page })
      .then((result) => { if (!cancelled) { setData(result); setError(''); } })
      .catch((err) => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [stage, applied, page, reload]);

  const counts = data?.counts;
  const tabs: Array<{ value: CustomerStage | undefined; label: string }> = [
    { value: undefined, label: `All${counts ? ` · ${counts.all}` : ''}` },
    ...(['active', 'scheduled', 'payment_required', 'onboarding', 'set_password', 'verify_email', 'suspended'] as const).map((value) => ({
      value,
      label: `${STAGE[value].label}${counts ? ` · ${counts[value]}` : ''}`,
    })),
  ];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setApplied(search.trim());
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-subtle">Every customer workspace: how they joined, their plan, and how far they are through setup.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs tabs={tabs} value={stage} onChange={(value) => { setStage(value); setPage(1); }} />
        <div className="flex flex-wrap items-center gap-2">
          {canSupport && (
            <Button
              type="button"
              variant="secondary"
              disabled={syncingDograh}
              onClick={handleSyncDograh}
              title="Pull new agents and phone lines created directly inside Dograh"
            >
              <RotateCcw className={cx("h-4 w-4 mr-1.5", syncingDograh && "animate-spin")} />
              {syncingDograh ? 'Syncing Dograh...' : 'Sync from Dograh'}
            </Button>
          )}
          <form onSubmit={submitSearch} className="flex w-full gap-2 sm:w-auto">
            <label className="relative flex-1 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                type="search"
                className="h-10 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Search name, email or business"
                maxLength={LIMITS.search.max}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search customers"
              />
            </label>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
        </div>
      </div>

      {error && <PageError message={error} onRetry={() => { setError(''); setReload((n) => n + 1); }} />}

      <Card className="overflow-hidden">
        {!data && !error && <div className="flex h-40 items-center justify-center text-subtle"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {data?.rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <Users className="h-8 w-8 text-subtle" />
            <p className="font-semibold">{applied || stage ? 'No customers match' : 'No customers yet'}</p>
            <p className="text-sm text-subtle">{applied || stage ? 'Try another filter or search.' : 'Customers appear when a request is approved or a plan is bought.'}</p>
          </div>
        )}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-background/60 text-left text-xs uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Stage</th>
                  <th className="px-4 py-3 font-semibold">Agents</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-4 py-3 font-semibold">Last sign-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((row) => (
                  <tr key={row.userId} className="cursor-pointer align-top hover:bg-background/50" onClick={() => setSelected(row)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">{initials(row.businessName || row.name || row.email)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.businessName || row.name || row.email}</p>
                          <p className="truncate text-xs text-subtle">{row.name ? `${row.name} · ` : ''}{row.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{row.plan?.name ?? <span className="text-subtle">Free access</span>}</td>
                    <td className="px-4 py-3"><StageBadge stage={row.stage} /></td>
                    <td className="px-4 py-3 tabular-nums">{row.agents}</td>
                    <td className="px-4 py-3 text-subtle">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3 text-subtle">{row.lastSignInAt ? timeAgo(row.lastSignInAt) : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && <Pager page={page} pages={pages} onPage={setPage} />}

      {selected && (
        <CustomerDrawer
          customer={selected}
          roles={roles}
          onClose={() => setSelected(null)}
          onChanged={() => setReload((n) => n + 1)}
        />
      )}
    </div>
  );
}

function StageBadge({ stage }: { stage: CustomerStage }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', STAGE[stage].style)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />{STAGE[stage].label}
    </span>
  );
}

function CustomerDrawer({ customer, roles, onClose, onChanged }: { customer: Customer; roles: string[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const canSupport = roles.includes('super_admin') || roles.includes('support');
  const canSuspend = roles.includes('super_admin');
  const [botData, setBotData] = useState<CustomerAgentsResponse | null>(null);
  const [loadingBots, setLoadingBots] = useState(true);
  const [usage, setUsage] = useState<CustomerUsage | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [selectedBotId, setSelectedBotId] = useState('');
  const [assignDirection, setAssignDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [showNewAgentForm, setShowNewAgentForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState(customer.businessName || '');
  const [newAgentIndustry, setNewAgentIndustry] = useState('');
  const [newAgentPhone, setNewAgentPhone] = useState('');
  const [newAgentDirection, setNewAgentDirection] = useState<'inbound' | 'outbound'>('inbound');

  // Phone number assignment
  const [showAssignNumberForm, setShowAssignNumberForm] = useState(false);
  const [numberMode, setNumberMode] = useState<'custom' | 'pool'>('custom');
  const [selectedPoolNumber, setSelectedPoolNumber] = useState('');
  const [customPhoneInput, setCustomPhoneInput] = useState('');
  const [targetBotIdForNumber, setTargetBotIdForNumber] = useState('');
  const [syncingDograh, setSyncingDograh] = useState(false);

  const handleSyncDograh = async () => {
    setSyncingDograh(true);
    try {
      const res = await customersApi.syncDograh();
      toast({
        tone: 'success',
        title: res.createdCount > 0
          ? `Synced from Dograh: ${res.createdCount} new persona(s) imported!`
          : (res.updatedCount > 0 ? `Synced from Dograh: ${res.updatedCount} persona(s) updated with phone lines.` : 'Synced from Dograh: All workflows are up to date.'),
      });
      const refreshed = await customersApi.getAgents(customer.userId);
      setBotData(refreshed);
    } catch (err: any) {
      toast({ tone: 'error', title: 'Dograh sync failed: ' + (err.message || 'Unknown error') });
    } finally {
      setSyncingDograh(false);
    }
  };

  // Agent limit restriction
  const [showLimitEditor, setShowLimitEditor] = useState(false);
  const [limitChoice, setLimitChoice] = useState<'plan' | 'custom'>('plan');
  const [customLimitValue, setCustomLimitValue] = useState('1');

  // Parallel / Concurrent Calls limit
  const [showConcurrentLimitEditor, setShowConcurrentLimitEditor] = useState(false);
  const [concurrentLimitChoice, setConcurrentLimitChoice] = useState<'plan' | 'custom'>('plan');
  const [customConcurrentLimitValue, setCustomConcurrentLimitValue] = useState('2');

  // Plan Assignment
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [planCurrency, setPlanCurrency] = useState<'INR' | 'USD'>((customer.plan?.currency as 'INR' | 'USD') || 'INR');
  const [customPlanExpiry, setCustomPlanExpiry] = useState('');

  const loadAvailablePlans = async () => {
    setLoadingPlans(true);
    try {
      const res = await billingAdminApi.plans({ page: 1, activeOnly: true });
      setAvailablePlans(res.plans);
    } catch {
      // Non-blocking
    } finally {
      setLoadingPlans(false);
    }
  };

  const loadBots = async () => {
    try {
      const res = await customersApi.getAgents(customer.userId);
      setBotData(res);
    } catch {
      // Non-blocking
    } finally {
      setLoadingBots(false);
    }
  };

  const loadUsage = async () => {
    setLoadingUsage(true);
    try {
      const res = await customersApi.getUsage(customer.userId);
      setUsage(res);
    } catch {
      // Non-blocking
    } finally {
      setLoadingUsage(false);
    }
  };

  useEffect(() => {
    void loadBots();
    void loadUsage();
  }, [customer.userId]);

  useEffect(() => {
    if (botData?.agentLimit) {
      if (botData.agentLimit.customLimit !== null) {
        setLimitChoice('custom');
        setCustomLimitValue(String(botData.agentLimit.customLimit));
      } else {
        setLimitChoice('plan');
        setCustomLimitValue(String(botData.agentLimit.planLimit || 1));
      }
    }
  }, [botData?.agentLimit]);

  useEffect(() => {
    if (botData?.concurrentLimit) {
      if (botData.concurrentLimit.customLimit !== null) {
        setConcurrentLimitChoice('custom');
        setCustomConcurrentLimitValue(String(botData.concurrentLimit.customLimit));
      } else {
        setConcurrentLimitChoice('plan');
        setCustomConcurrentLimitValue(String(botData.concurrentLimit.planLimit || 1));
      }
    }
  }, [botData?.concurrentLimit]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const suspended = customer.status === 'suspended';
  const canResend = !suspended && (customer.stage === 'verify_email' || customer.stage === 'set_password');

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError('');
    try {
      await action();
      toast({ tone: 'success', title: done });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const toggleSuspend = () => {
    const question = suspended
      ? `Reactivate ${customer.email}? They can sign in again straight away.`
      : `Suspend ${customer.email}? They are signed out and cannot sign in until reactivated.`;
    if (!window.confirm(question)) return;
    void act(() => customersApi.setStatus(customer.userId, suspended ? 'active' : 'suspended'), suspended ? 'Customer reactivated' : 'Customer suspended');
  };

  const handleDirectionChange = async (botId: string, nextDir: 'inbound' | 'outbound', currentDir: 'inbound' | 'outbound') => {
    if (currentDir === nextDir) return;
    await act(async () => {
      await customersApi.updateAgentDirection(customer.userId, { botId, direction: nextDir });
      const refreshed = await customersApi.getAgents(customer.userId);
      setBotData(refreshed);
    }, `Agent mode set to ${nextDir}`);
  };

  const handleUnassignAgent = async (botId: string, businessName: string) => {
    if (!window.confirm(`Unassign voice agent "${businessName}"? This will detach this persona and free up customer quota while preserving all historical leads, appointments, and call logs.`)) return;
    await act(async () => {
      await customersApi.unassignAgent(customer.userId, { botId });
      const refreshed = await customersApi.getAgents(customer.userId);
      setBotData(refreshed);
    }, `Agent "${businessName}" unassigned`);
  };

  const details: Array<[string, string]> = [
    ['Email', customer.email],
    ['Name', customer.name ?? '—'],
    ['Business', customer.businessName ?? '—'],
    ['Joined via', SOURCE[customer.source]],
    ['Plan', customer.plan ? `${customer.plan.name}${customer.plan.currency ? ` (${customer.plan.currency})` : ''}` : 'Free access'],
    ['Plan starts', customer.plan?.startsAt ? formatDate(customer.plan.startsAt) : 'After email verification'],
    ['Current period ends', customer.plan?.periodEnd ? formatExpiryIST(customer.plan.periodEnd) : '—'],
    ['Agents', String(customer.agents)],
    ['Email confirmed', customer.emailConfirmedAt ? formatDate(customer.emailConfirmedAt) : 'Not yet'],
    ['Last sign-in', customer.lastSignInAt ? formatDate(customer.lastSignInAt) : 'Never'],
    ['Joined', formatDate(customer.createdAt)],
  ];

  return (
    <Drawer
      title={customer.businessName || customer.name || customer.email}
      subtitle={customer.email}
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {canSupport && canResend && (
          <Button variant="secondary" disabled={busy} onClick={() => act(() => customersApi.resend(customer.userId), 'Email sent')}>
            <Mail className="h-4 w-4" /> Resend {customer.stage === 'verify_email' ? 'confirmation' : 'activation'}
          </Button>
        )}
        {canSuspend && (
          <Button variant={suspended ? 'primary' : 'dangerOutline'} disabled={busy} onClick={toggleSuspend}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : suspended ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            {suspended ? 'Reactivate' : 'Suspend'}
          </Button>
        )}
      </>}
    >
      {error && <p role="alert" className="rounded-xl bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      <StageBadge stage={customer.stage} />

      {/* Plan & Subscription Card */}
      <div className="rounded-2xl border border-line bg-surface/70 p-3.5 space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-subtle block">Subscription Plan</span>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-ink">
                {customer.plan ? customer.plan.name : 'Free Access'}
              </span>
              {customer.plan?.currency && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-primary/10 text-primary border border-primary/20">
                  {customer.plan.currency}
                </span>
              )}
            </div>
          </div>
          {canSupport && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowPlanEditor((v) => !v);
                if (!availablePlans.length) void loadAvailablePlans();
              }}
            >
              {showPlanEditor ? 'Cancel' : 'Change Plan'}
            </Button>
          )}
        </div>

        {customer.plan?.periodEnd && (
          <div className="text-[11px] text-subtle flex items-center justify-between pt-1 border-t border-line/50">
            <span>Current Period Expiry:</span>
            <span className="font-medium text-ink font-mono">{formatExpiryIST(customer.plan.periodEnd)}</span>
          </div>
        )}

        {/* Change Plan Form */}
        {canSupport && showPlanEditor && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selectedPlanId) return;
              await act(async () => {
                await customersApi.assignPlan(customer.userId, {
                  planId: selectedPlanId,
                  currency: planCurrency,
                  expiryDate: customPlanExpiry || undefined,
                });
                setShowPlanEditor(false);
                await loadBots();
              }, 'Plan successfully assigned to customer');
            }}
            className="pt-2 border-t border-line space-y-2.5"
          >
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-ink block">Select New Plan:</label>
              {loadingPlans ? (
                <div className="flex items-center text-subtle text-xs py-1">
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Loading active plans...
                </div>
              ) : (
                <select
                  className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                  value={selectedPlanId}
                  onChange={(e) => {
                    setSelectedPlanId(e.target.value);
                    const p = availablePlans.find((plan) => plan.id === e.target.value);
                    if (p?.price_usd && p.price_usd > 0 && !p.price_inr) setPlanCurrency('USD');
                  }}
                  required
                >
                  <option value="">Choose a plan...</option>
                  {availablePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.is_trial ? `(${p.trial_days || 7}-day trial)` : p.price_inr ? `(₹${(p.price_inr / 100).toLocaleString('en-IN')}/mo)` : ''} {p.monthly_minutes ? `• ${p.monthly_minutes} mins` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-ink block">Billing Currency:</label>
                <select
                  className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                  value={planCurrency}
                  onChange={(e) => setPlanCurrency(e.target.value as 'INR' | 'USD')}
                >
                  <option value="INR">₹ INR (India)</option>
                  <option value="USD">$ USD (International)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-ink block">Custom Expiry (optional):</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
                  value={customPlanExpiry}
                  onChange={(e) => setCustomPlanExpiry(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>

            <p className="text-[10px] text-subtle leading-relaxed">
              Assigning this plan immediately updates the customer's minutes quota, active plan status, and default persona limit across the entire platform.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" type="button" onClick={() => setShowPlanEditor(false)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" disabled={busy || !selectedPlanId}>
                Confirm & Assign Plan
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Usage & Telephony Activity Card */}
      <div className="rounded-2xl border border-line bg-surface/70 p-3.5 space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-ink leading-tight">Telephony & Service Usage</h4>
              <p className="text-[11px] text-subtle">Real-time inbound & outbound activity tracking</p>
            </div>
          </div>
          {loadingUsage ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-subtle" />
          ) : (
            <span className="text-[11px] font-bold font-mono text-ink bg-white px-2 py-0.5 rounded-full border border-line shadow-sm">
              {usage?.totalCalls ?? 0} calls · {usage?.totalMinutes ?? 0}m
            </span>
          )}
        </div>

        {loadingUsage ? (
          <div className="flex items-center justify-center py-4 text-xs text-subtle">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading telephony usage metrics...
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              {/* Inbound Stats */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/50 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                    <PhoneIncoming className="h-3 w-3 text-emerald-600" /> Inbound
                  </span>
                  <span className="text-xs font-bold text-emerald-900 font-mono">
                    {usage?.inboundCalls ?? 0} calls
                  </span>
                </div>
                <div className="pt-1 border-t border-emerald-200/50 flex items-baseline justify-between">
                  <span className="text-[11px] text-emerald-800">Duration:</span>
                  <span className="text-xs font-semibold text-emerald-950 font-mono">
                    {usage?.inboundMinutes ?? 0}m <span className="text-[10px] text-emerald-700 font-normal">({usage?.inboundSeconds ?? 0}s)</span>
                  </span>
                </div>
              </div>

              {/* Outbound Stats */}
              <div className="rounded-xl border border-sky-500/20 bg-sky-50/50 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 flex items-center gap-1">
                    <PhoneOutgoing className="h-3 w-3 text-sky-600" /> Outbound
                  </span>
                  <span className="text-xs font-bold text-sky-900 font-mono">
                    {usage?.outboundCalls ?? 0} calls
                  </span>
                </div>
                <div className="pt-1 border-t border-sky-200/50 flex items-baseline justify-between">
                  <span className="text-[11px] text-sky-800">Duration:</span>
                  <span className="text-xs font-semibold text-sky-950 font-mono">
                    {usage?.outboundMinutes ?? 0}m <span className="text-[10px] text-sky-700 font-normal">({usage?.outboundSeconds ?? 0}s)</span>
                  </span>
                </div>
              </div>
            </div>

            {usage && usage.totalCalls > 0 ? (
              <div className="rounded-lg bg-surface/80 border border-line/60 px-2.5 py-1.5 flex items-center justify-between text-[11px] text-subtle">
                <span>Cumulative Voice Traffic:</span>
                <span className="font-semibold text-ink font-mono">
                  {usage.totalMinutes} total minutes ({usage.botsCount} active {usage.botsCount === 1 ? 'agent' : 'agents'})
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-subtle text-center py-1 italic">
                No inbound or outbound calls recorded yet for this customer.
              </p>
            )}
          </div>
        )}
      </div>

      <dl className="divide-y divide-line rounded-2xl border border-line">
        {details.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
            <dt className="text-subtle">{label}</dt>
            <dd className="text-right font-medium break-all">{value}</dd>
          </div>
        ))}
      </dl>
      {customer.stage === 'verify_email' && <p className="text-xs text-subtle">They have not confirmed their email yet, so they cannot use the app. Resending sends a fresh confirmation link.</p>}
      {customer.stage === 'set_password' && <p className="text-xs text-subtle">Their email is confirmed but no password is set. Resending sends a fresh activation link.</p>}

      <div className="space-y-3 pt-3 border-t border-line">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-ink flex items-center gap-1.5">
            <Bot className="h-4 w-4 text-primary" />
            Assigned Voice Agents ({botData?.assigned.length ?? 0})
          </h3>
          {canSupport && (
            <Button
              variant="ghost"
              size="sm"
              disabled={!showNewAgentForm && Boolean(botData?.agentLimit?.effectiveLimit !== null && botData?.agentLimit?.effectiveLimit !== undefined && (botData?.assigned.length ?? 0) >= botData.agentLimit.effectiveLimit)}
              onClick={() => setShowNewAgentForm((v) => !v)}
            >
              {showNewAgentForm ? 'Cancel' : '+ Provision Agent'}
            </Button>
          )}
        </div>

        {/* Parallel / Concurrent Calls Rate Limit Card */}
        {botData?.concurrentLimit && (
          <div className="rounded-xl border border-line bg-surface/60 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-subtle block">Parallel Calls Rate Limit</span>
                <span className="text-ink font-semibold">
                  {botData.concurrentLimit.current} active · Limit: {botData.concurrentLimit.effectiveLimit} concurrent {botData.concurrentLimit.effectiveLimit === 1 ? 'call' : 'calls'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cx(
                  'text-[10px] px-2 py-0.5 rounded font-medium',
                  botData.concurrentLimit.customLimit !== null
                    ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                    : 'bg-primary/10 text-primary border border-primary/20'
                )}>
                  {botData.concurrentLimit.customLimit !== null ? 'Custom Override' : `Plan Default (${botData.concurrentLimit.planName})`}
                </span>
                {canSupport && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowConcurrentLimitEditor((v) => !v)}
                  >
                    {showConcurrentLimitEditor ? 'Close' : 'Edit'}
                  </Button>
                )}
              </div>
            </div>

            {/* Concurrent Limit Form */}
            {canSupport && showConcurrentLimitEditor && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const targetLimit = concurrentLimitChoice === 'plan' ? null : parseInt(customConcurrentLimitValue, 10);
                  await act(async () => {
                    await customersApi.updateConcurrentLimit(customer.userId, { limit: targetLimit });
                    setShowConcurrentLimitEditor(false);
                    await loadBots();
                  }, 'Parallel call limit updated');
                }}
                className="pt-2 border-t border-line space-y-2"
              >
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-ink">
                    <input
                      type="radio"
                      name="concurrentLimitChoice"
                      checked={concurrentLimitChoice === 'plan'}
                      onChange={() => setConcurrentLimitChoice('plan')}
                    />
                    <span>Follow Plan Default ({botData.concurrentLimit.planLimit ?? 'Unlimited'} concurrent calls)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-ink">
                    <input
                      type="radio"
                      name="concurrentLimitChoice"
                      checked={concurrentLimitChoice === 'custom'}
                      onChange={() => setConcurrentLimitChoice('custom')}
                    />
                    <span>Set Custom Limit for Customer:</span>
                  </label>
                  {concurrentLimitChoice === 'custom' && (
                    <div className="pl-6 flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        maxLength={4}
                        className="w-24 rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
                        value={customConcurrentLimitValue}
                        onChange={(e) => setCustomConcurrentLimitValue(e.target.value)}
                        required
                      />
                      <span className="text-subtle text-[11px]">parallel calls allowed</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="ghost" type="button" onClick={() => setShowConcurrentLimitEditor(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" type="submit" disabled={busy}>
                    Save Parallel Limit
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Agent Limit Restriction Card */}
        {botData?.agentLimit && (
          <div className="rounded-xl border border-line bg-background/60 p-2.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-ink flex items-center gap-1.5">
                Agent Limit:
                <strong className={cx('tabular-nums font-semibold', (botData.agentLimit.effectiveLimit !== null && botData.assigned.length >= botData.agentLimit.effectiveLimit) ? 'text-warning' : 'text-primary')}>
                  {botData.assigned.length} / {botData.agentLimit.effectiveLimit ?? 'Unlimited'}
                </strong>
                {botData.agentLimit.effectiveLimit !== null && botData.assigned.length >= botData.agentLimit.effectiveLimit && (
                  <span className="text-[10px] bg-warning-surface text-warning px-1.5 py-0.5 rounded font-medium">
                    Limit Reached
                  </span>
                )}
              </span>
              {canSupport && (
                <button
                  type="button"
                  className="text-[11px] text-primary font-medium hover:underline flex items-center gap-1"
                  onClick={() => setShowLimitEditor((v) => !v)}
                >
                  <Edit2 className="h-3 w-3" />
                  {showLimitEditor ? 'Close' : 'Configure Limit'}
                </button>
              )}
            </div>

            <div className="text-[11px] text-subtle flex items-center justify-between">
              <span>
                Plan: <strong>{botData.agentLimit.planName}</strong> (Default: {botData.agentLimit.planLimit ?? 'Unlimited'})
              </span>
              {botData.agentLimit.customLimit !== null && (
                <span className="text-info font-medium">
                  Custom Limit: {botData.agentLimit.customLimit} active personas
                </span>
              )}
            </div>

            {/* Limit Restriction Editor */}
            {canSupport && showLimitEditor && (
              <div className="pt-2 border-t border-line space-y-2">
                <div className="space-y-1.5 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="limitChoice"
                      checked={limitChoice === 'plan'}
                      onChange={() => setLimitChoice('plan')}
                    />
                    <span>Follow Plan Default ({botData.agentLimit.planLimit ?? 'Unlimited'} personas)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="limitChoice"
                      checked={limitChoice === 'custom'}
                      onChange={() => setLimitChoice('custom')}
                    />
                    <span>Set Custom Limit for this Customer</span>
                  </label>
                </div>

                {limitChoice === 'custom' && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      maxLength={4}
                      value={customLimitValue}
                      onChange={(e) => setCustomLimitValue(e.target.value)}
                      className="w-24 rounded-lg border border-line bg-white px-2.5 py-1 text-xs text-ink focus:border-primary focus:outline-none font-mono"
                      placeholder="e.g. 2"
                      required
                    />
                    <span className="text-[11px] text-subtle">Maximum personas allowed for this customer</span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setShowLimitEditor(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      const limitToSave = limitChoice === 'custom' ? parseInt(customLimitValue, 10) : null;
                      await act(async () => {
                        await customersApi.updateAgentLimit(customer.userId, { limit: limitToSave });
                        const refreshed = await customersApi.getAgents(customer.userId);
                        setBotData(refreshed);
                        setShowLimitEditor(false);
                      }, 'Agent limit restriction updated');
                    }}
                  >
                    Save Limit
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {loadingBots ? (
          <div className="flex items-center justify-center py-4 text-xs text-subtle">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading assigned agents...
          </div>
        ) : botData?.assigned.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-3 text-center text-xs text-subtle">
            No agent persona currently assigned to this customer.
          </div>
        ) : (
          <div className="space-y-2">
            {botData?.assigned.map((bot) => {
              const currentDir: 'inbound' | 'outbound' = bot.widget_config?.agentDirection === 'outbound' || (!bot.widget_config?.agentDirection && bot.dograh_outbound_workflow_id && !bot.dograh_workflow_id) ? 'outbound' : 'inbound';
              return (
              <div key={bot.id} className="rounded-xl border border-line bg-surface/50 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink text-sm">{bot.business_name}</span>
                    {/* Small Glowing Text Badge */}
                    {currentDir === 'inbound' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 shadow-[0_0_10px_rgba(16,185,129,0.35)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_#10b981]" />
                        Inbound
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-cyan-500/15 border border-cyan-500/40 text-cyan-600 shadow-[0_0_10px_rgba(6,182,212,0.35)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_6px_#06b6d4]" />
                        Outbound
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success bg-success-surface px-2 py-0.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" /> Active
                  </span>
                </div>
                <p className="text-subtle">Industry: {bot.industry || 'General'}</p>
                
                {/* Phone Line Status on Agent Card */}
                <div className="flex items-center justify-between rounded-lg border border-line bg-background/50 px-2.5 py-1.5">
                  <span className="font-mono text-ink font-medium flex items-center gap-1.5">
                    <PhoneCall className="h-3.5 w-3.5 text-primary" />
                    {bot.dograh_phone_number || <span className="text-subtle font-sans italic font-normal">No line assigned</span>}
                  </span>
                  {canSupport && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-[11px] font-medium text-primary hover:underline"
                        onClick={() => {
                          setTargetBotIdForNumber(bot.id);
                          setCustomPhoneInput(bot.dograh_phone_number || '');
                          setShowAssignNumberForm(true);
                        }}
                      >
                        {bot.dograh_phone_number ? 'Change Line' : '+ Assign Line'}
                      </button>
                      {bot.dograh_phone_number && (
                        <>
                          <span className="text-line">·</span>
                          <button
                            type="button"
                            className="text-[11px] text-danger hover:underline"
                            disabled={busy}
                            onClick={async () => {
                              if (!window.confirm(`Unassign phone line ${bot.dograh_phone_number} from ${bot.business_name}?`)) return;
                              await act(async () => {
                                await customersApi.unassignNumber(customer.userId, { botId: bot.id });
                                const refreshed = await customersApi.getAgents(customer.userId);
                                setBotData(refreshed);
                              }, 'Phone line unassigned');
                            }}
                          >
                            Unlink
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Assigned Direction Switcher */}
                {canSupport && (
                  <div className="flex items-center justify-between text-[11px] bg-background/50 px-2.5 py-1.5 rounded-lg border border-line/60">
                    <span className="text-subtle font-medium">Assigned Call Mode:</span>
                    <div className="flex rounded-md border border-line bg-white p-0.5 text-[10px]">
                      {(['inbound', 'outbound'] as const).map((d) => {
                        const currentDir: 'inbound' | 'outbound' = bot.widget_config?.agentDirection === 'outbound' || (!bot.widget_config?.agentDirection && bot.dograh_outbound_workflow_id && !bot.dograh_workflow_id) ? 'outbound' : 'inbound';
                        return (
                          <button
                            key={d}
                            type="button"
                            disabled={busy}
                            onClick={() => handleDirectionChange(bot.id, d, currentDir)}
                            className={cx(
                              'px-2 py-0.5 rounded font-medium capitalize transition-all',
                              currentDir === d
                                ? d === 'inbound'
                                  ? 'bg-emerald-500 text-white shadow-sm'
                                  : 'bg-cyan-500 text-white shadow-sm'
                                : 'text-subtle hover:text-ink'
                            )}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-line/50">
                  <div className="flex gap-2">
                    {currentDir === 'outbound' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded border bg-background/50 text-subtle/50 border-line line-through">
                        Inbound: Disabled
                      </span>
                    ) : (
                      <span className={cx('text-[10px] px-2 py-0.5 rounded border font-medium', bot.dograh_workflow_id ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-background text-subtle border-line')}>
                        Inbound: {bot.dograh_workflow_id ? 'Configured' : 'Ready'}
                      </span>
                    )}
                    {currentDir === 'inbound' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded border bg-background/50 text-subtle/50 border-line line-through">
                        Outbound: Disabled
                      </span>
                    ) : (
                      <span className={cx('text-[10px] px-2 py-0.5 rounded border font-medium', bot.dograh_outbound_workflow_id ? 'bg-cyan-50 text-cyan-700 border-cyan-300' : 'bg-background text-subtle border-line')}>
                        Outbound: {bot.dograh_outbound_workflow_id ? 'Configured' : 'Ready'}
                      </span>
                    )}
                  </div>
                  {canSupport && (
                    <Button
                      size="sm"
                      variant="dangerOutline"
                      disabled={busy}
                      onClick={() => handleUnassignAgent(bot.id, bot.business_name)}
                    >
                      <UserMinus className="h-3 w-3 mr-1" />
                      Unassign Agent
                    </Button>
                  )}
                </div>
              </div>
            );
            })}
          </div>
        )}

        {/* Limit Reached Warning */}
        {botData?.agentLimit?.effectiveLimit !== null && botData?.agentLimit?.effectiveLimit !== undefined && (botData?.assigned.length ?? 0) >= botData.agentLimit.effectiveLimit && (
          <div className="rounded-xl border border-warning/30 bg-warning-surface/40 p-3 text-xs text-warning space-y-1">
            <span className="font-semibold block">Agent Limit Reached</span>
            <p className="text-[11px] leading-relaxed">
              This customer has reached their maximum limit of {botData.agentLimit.effectiveLimit} active voice persona(s).
              To add more, either configure a higher limit above or remove an existing agent.
            </p>
          </div>
        )}

        {canSupport && botData && !showNewAgentForm && !(botData.agentLimit?.effectiveLimit !== null && botData.agentLimit?.effectiveLimit !== undefined && botData.assigned.length >= botData.agentLimit.effectiveLimit) && (
          <div className="rounded-xl border border-line bg-background/50 p-3 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink block">Assign Existing Persona ({botData.all.length})</span>
              <button
                type="button"
                disabled={syncingDograh || busy}
                onClick={handleSyncDograh}
                className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                title="Pull new agents and phone lines created directly inside Dograh"
              >
                <RotateCcw className={cx("h-3 w-3", syncingDograh && "animate-spin")} />
                {syncingDograh ? 'Syncing...' : 'Sync from Dograh'}
              </button>
            </div>
            {botData.all.length === 0 ? (
              <p className="text-xs text-subtle italic">No existing personas found. Click "Sync from Dograh" above to import workflows from Dograh.</p>
            ) : (
              <div className="flex gap-2">
                <select
                  className="flex-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                  value={selectedBotId}
                  onChange={(e) => setSelectedBotId(e.target.value)}
                >
                  <option value="">Select an agent persona...</option>
                  {botData.all.map((b) => (
                    <option key={b.id} value={b.id} disabled={b.owner_id === customer.userId}>
                      {b.business_name} {b.dograh_phone_number ? `(${b.dograh_phone_number})` : ''} {b.owner_id === customer.userId ? '(Assigned to this user)' : ''}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!selectedBotId || busy}
                  onClick={async () => {
                    if (!selectedBotId) return;
                    await act(async () => {
                      await customersApi.assignAgent(customer.userId, { botId: selectedBotId, direction: assignDirection });
                      const refreshed = await customersApi.getAgents(customer.userId);
                      setBotData(refreshed);
                      setSelectedBotId('');
                    }, 'Agent persona assigned');
                  }}
                >
                  Assign
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-line/60">
              <span className="text-[11px] text-subtle font-medium">Dedicated Direction:</span>
              <div className="flex rounded-md border border-line bg-white p-0.5 text-[10px]">
                {(['inbound', 'outbound'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={cx(
                      'px-2.5 py-0.5 rounded font-medium capitalize transition-all',
                      assignDirection === d
                        ? d === 'inbound'
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-cyan-500 text-white shadow-sm'
                        : 'text-subtle hover:text-ink'
                    )}
                    onClick={() => setAssignDirection(d)}
                  >
                    {`${d} only`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {canSupport && showNewAgentForm && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newAgentName.trim()) return;
              await act(async () => {
                await customersApi.createAgent(customer.userId, {
                  businessName: newAgentName,
                  industry: newAgentIndustry,
                  phoneNumber: newAgentPhone,
                  direction: newAgentDirection,
                });
                const refreshed = await customersApi.getAgents(customer.userId);
                setBotData(refreshed);
                setShowNewAgentForm(false);
                setNewAgentName('');
                setNewAgentIndustry('');
                setNewAgentPhone('');
                setNewAgentDirection('inbound');
              }, 'New agent provisioned and assigned');
            }}
            className="rounded-xl border border-primary/20 bg-primary-soft/10 p-3 space-y-2 text-xs"
          >
            <span className="font-semibold text-ink block">Provision & Assign New Persona</span>
            <input
              type="text"
              placeholder="Persona / Business Name"
              maxLength={120}
              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Industry (e.g. Healthcare, Real Estate, Retail)"
              maxLength={60}
              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
              value={newAgentIndustry}
              onChange={(e) => setNewAgentIndustry(e.target.value)}
            />
            <input
              type="text"
              placeholder="Assigned Phone Number (e.g. +91 98765 43210)"
              maxLength={30}
              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
              value={newAgentPhone}
              onChange={(e) => setNewAgentPhone(e.target.value)}
            />
            <div className="flex items-center justify-between pt-1 border-t border-primary/20">
              <span className="text-[11px] text-subtle font-medium">Dedicated Direction:</span>
              <div className="flex rounded-md border border-line bg-white p-0.5 text-[10px]">
                {(['inbound', 'outbound'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={cx(
                      'px-2.5 py-0.5 rounded font-medium capitalize transition-all',
                      newAgentDirection === d
                        ? d === 'inbound'
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-cyan-500 text-white shadow-sm'
                        : 'text-subtle hover:text-ink'
                    )}
                    onClick={() => setNewAgentDirection(d)}
                  >
                    {`${d} only`}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => setShowNewAgentForm(false)}>Cancel</Button>
              <Button size="sm" type="submit" disabled={busy || !newAgentName.trim()}>Provision & Assign</Button>
            </div>
          </form>
        )}
      </div>

      {/* Dedicated Section: Assigned Phone Numbers in Same Manner as Agents */}
      <div className="space-y-3 pt-4 border-t border-line">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-ink flex items-center gap-1.5">
            <Phone className="h-4 w-4 text-primary" />
            Assigned Phone Numbers ({botData?.assigned.filter((b) => Boolean(b.dograh_phone_number)).length ?? 0})
          </h3>
          {canSupport && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAssignNumberForm((v) => !v);
                if (!targetBotIdForNumber && botData?.assigned?.[0]?.id) {
                  setTargetBotIdForNumber(botData.assigned[0].id);
                }
              }}
            >
              {showAssignNumberForm ? 'Cancel' : '+ Assign Number'}
            </Button>
          )}
        </div>

        {loadingBots ? (
          <div className="flex items-center justify-center py-4 text-xs text-subtle">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading assigned numbers...
          </div>
        ) : !botData?.assigned.some((b) => Boolean(b.dograh_phone_number)) ? (
          <div className="rounded-xl border border-dashed border-line p-3 text-center text-xs text-subtle">
            No dedicated phone lines currently assigned to this customer.
          </div>
        ) : (
          <div className="space-y-2">
            {botData.assigned
              .filter((b) => Boolean(b.dograh_phone_number))
              .map((bot) => (
                <div key={`line-${bot.id}`} className="rounded-xl border border-line bg-surface/50 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-ink text-sm flex items-center gap-1.5">
                      <PhoneCall className="h-4 w-4 text-primary" />
                      {bot.dograh_phone_number}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success bg-success-surface px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" /> Active Line
                    </span>
                  </div>
                  <p className="text-subtle">
                    Routes to agent: <strong className="text-ink">{bot.business_name}</strong> ({bot.industry || 'General'})
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-line/50">
                    <span className="text-[10px] text-subtle">Dedicated Telephony · Inbound & Outbound</span>
                    {canSupport && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setTargetBotIdForNumber(bot.id);
                            setCustomPhoneInput(bot.dograh_phone_number || '');
                            setShowAssignNumberForm(true);
                          }}
                        >
                          Change
                        </Button>
                        <Button
                          size="sm"
                          variant="dangerOutline"
                          disabled={busy}
                          onClick={async () => {
                            if (!window.confirm(`Unassign phone line ${bot.dograh_phone_number} from ${bot.business_name}?`)) return;
                            await act(async () => {
                              await customersApi.unassignNumber(customer.userId, { botId: bot.id });
                              const refreshed = await customersApi.getAgents(customer.userId);
                              setBotData(refreshed);
                            }, 'Phone line unassigned');
                          }}
                        >
                          Unassign
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Assign Number Form: Choose Pool Number or Enter Custom Dedicated Line */}
        {canSupport && showAssignNumberForm && (
          <div className="rounded-xl border border-primary/20 bg-primary-soft/10 p-3 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink">Assign Phone Line</span>
              <div className="flex rounded-lg border border-line bg-white p-0.5 text-[11px]">
                <button
                  type="button"
                  className={cx('px-2 py-0.5 rounded-md transition-colors', numberMode === 'custom' ? 'bg-primary text-white font-medium' : 'text-subtle hover:text-ink')}
                  onClick={() => setNumberMode('custom')}
                >
                  Dedicated Number
                </button>
                <button
                  type="button"
                  className={cx('px-2 py-0.5 rounded-md transition-colors', numberMode === 'pool' ? 'bg-primary text-white font-medium' : 'text-subtle hover:text-ink')}
                  onClick={() => setNumberMode('pool')}
                >
                  Pool / System
                </button>
              </div>
            </div>

            {botData?.assigned.length === 0 ? (
              <div className="p-2.5 rounded-lg bg-warning-surface text-warning text-xs">
                Please assign or provision a voice agent persona above first so incoming and outgoing calls can be answered on this line.
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const phoneToAssign = numberMode === 'custom' ? customPhoneInput.trim() : (selectedPoolNumber || botData?.availableNumbers?.[0] || '').trim();
                  if (!phoneToAssign) return;
                  const targetBot = targetBotIdForNumber || botData?.assigned[0]?.id;
                  if (!targetBot) return;

                  await act(async () => {
                    await customersApi.assignNumber(customer.userId, {
                      botId: targetBot,
                      phoneNumber: phoneToAssign,
                    });
                    const refreshed = await customersApi.getAgents(customer.userId);
                    setBotData(refreshed);
                    setShowAssignNumberForm(false);
                    setCustomPhoneInput('');
                  }, `Phone line ${phoneToAssign} assigned`);
                }}
                className="space-y-2.5"
              >
                <div>
                  <label className="text-[11px] font-medium text-subtle block mb-1">Route Calls To Agent Persona</label>
                  <select
                    className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                    value={targetBotIdForNumber || (botData?.assigned[0]?.id ?? '')}
                    onChange={(e) => setTargetBotIdForNumber(e.target.value)}
                    required
                  >
                    {botData?.assigned.map((bot) => (
                      <option key={bot.id} value={bot.id}>
                        {bot.business_name} {bot.dograh_phone_number ? `(Current Line: ${bot.dograh_phone_number})` : '(No line)'}
                      </option>
                    ))}
                  </select>
                </div>

                {numberMode === 'custom' ? (
                  <div>
                    <label className="text-[11px] font-medium text-subtle block mb-1">Dedicated Phone Number (DID / Carrier line)</label>
                    <input
                      type="text"
                      placeholder="e.g. +91 98765 43210 or +91 22 6423 0099"
                      maxLength={30}
                      className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none font-mono"
                      value={customPhoneInput}
                      onChange={(e) => setCustomPhoneInput(e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] font-medium text-subtle block mb-1">Select from Available System / Pool Numbers</label>
                    {botData?.availableNumbers && botData.availableNumbers.length > 0 ? (
                      <select
                        className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none font-mono"
                        value={selectedPoolNumber || (botData.availableNumbers[0] ?? '')}
                        onChange={(e) => setSelectedPoolNumber(e.target.value)}
                        required
                      >
                        {botData.availableNumbers.map((num) => (
                          <option key={num} value={num}>
                            {num}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-subtle italic">No pool numbers detected. Use "Dedicated Number" to enter a phone line.</p>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setShowAssignNumberForm(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    type="submit"
                    disabled={busy || (numberMode === 'custom' ? !customPhoneInput.trim() : !selectedPoolNumber && !botData?.availableNumbers?.length)}
                  >
                    Assign Number
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
