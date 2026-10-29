import { formatExpiryIST } from '@ai-receptionist/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { Ban, Bot, Loader2, Mail, PhoneCall, RotateCcw, Search, Users } from 'lucide-react';
import { LIMITS } from '@ai-receptionist/contracts';
import { customersApi, type Customer, type CustomerStage, type BotSummary } from '../api';
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
  const [stage, setStage] = useState<CustomerStage | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: Customer[]; total: number; pageSize: number; counts: Counts } | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Customer | null>(null);

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
          onChanged={() => { setSelected(null); setReload((n) => n + 1); }}
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
  const [botData, setBotData] = useState<{ assigned: BotSummary[]; all: BotSummary[] } | null>(null);
  const [loadingBots, setLoadingBots] = useState(true);
  const [selectedBotId, setSelectedBotId] = useState('');
  const [showNewAgentForm, setShowNewAgentForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState(customer.businessName || '');
  const [newAgentIndustry, setNewAgentIndustry] = useState('');
  const [newAgentPhone, setNewAgentPhone] = useState('');

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

  useEffect(() => {
    void loadBots();
  }, [customer.userId]);
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
              onClick={() => setShowNewAgentForm((v) => !v)}
            >
              {showNewAgentForm ? 'Cancel' : '+ Provision Agent'}
            </Button>
          )}
        </div>

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
            {botData?.assigned.map((bot) => (
              <div key={bot.id} className="rounded-xl border border-line bg-surface/50 p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">{bot.business_name}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success bg-success-surface px-2 py-0.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" /> Active
                  </span>
                </div>
                <p className="text-subtle">Industry: {bot.industry || 'General'}</p>
                <p className="text-subtle flex items-center gap-1.5 font-mono">
                  <PhoneCall className="h-3.5 w-3.5 text-primary" />
                  {bot.dograh_phone_number || 'No phone number assigned'}
                </p>
                <div className="flex gap-2 pt-1">
                  <span className={cx('text-[10px] px-2 py-0.5 rounded border', bot.dograh_workflow_id ? 'bg-info-surface text-info border-info/30' : 'bg-background text-subtle border-line')}>
                    Inbound: {bot.dograh_workflow_id ? 'Configured' : 'Ready'}
                  </span>
                  <span className={cx('text-[10px] px-2 py-0.5 rounded border', bot.dograh_outbound_workflow_id ? 'bg-info-surface text-info border-info/30' : 'bg-background text-subtle border-line')}>
                    Outbound: {bot.dograh_outbound_workflow_id ? 'Configured' : 'Ready'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {canSupport && botData && botData.all.length > 0 && !showNewAgentForm && (
          <div className="rounded-xl border border-line bg-background/50 p-3 space-y-2 text-xs">
            <span className="font-semibold text-ink block">Assign Existing Persona</span>
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
                    await customersApi.assignAgent(customer.userId, selectedBotId);
                    const refreshed = await customersApi.getAgents(customer.userId);
                    setBotData(refreshed);
                    setSelectedBotId('');
                  }, 'Agent persona assigned');
                }}
              >
                Assign
              </Button>
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
                });
                const refreshed = await customersApi.getAgents(customer.userId);
                setBotData(refreshed);
                setShowNewAgentForm(false);
                setNewAgentPhone('');
              }, 'New agent provisioned and assigned');
            }}
            className="rounded-xl border border-primary/20 bg-primary-soft/10 p-3 space-y-2 text-xs"
          >
            <span className="font-semibold text-ink block">Provision & Assign New Persona</span>
            <input
              type="text"
              placeholder="Persona / Business Name"
              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Industry (e.g. Healthcare, Real Estate, Retail)"
              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
              value={newAgentIndustry}
              onChange={(e) => setNewAgentIndustry(e.target.value)}
            />
            <input
              type="text"
              placeholder="Assigned Phone Number (e.g. +91 98765 43210)"
              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
              value={newAgentPhone}
              onChange={(e) => setNewAgentPhone(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => setShowNewAgentForm(false)}>Cancel</Button>
              <Button size="sm" type="submit" disabled={busy || !newAgentName.trim()}>Provision & Assign</Button>
            </div>
          </form>
        )}
      </div>
    </Drawer>
  );
}
