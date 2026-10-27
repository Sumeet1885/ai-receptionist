import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Bell, Inbox, LayoutDashboard, LogOut, Menu, Package, ShieldCheck, TicketPercent, TrendingUp, UserPlus, X } from 'lucide-react';
import { accessRequestApi, adminApi, type AdminSession } from './api';
import { LiveContext, type LiveState } from './live';
import { navigate, PAGE_PATHS, type Page } from './router';
import { playChime, useToast } from './toast';
import { cx, initials, LOGO } from './ui';
import { useAdminEvents } from './useAdminEvents';

const NAV: Array<{ page: Page; label: string; icon: typeof Inbox }> = [
  { page: 'overview', label: 'Overview', icon: LayoutDashboard },
  { page: 'requests', label: 'Access requests', icon: Inbox },
  { page: 'revenue', label: 'Revenue', icon: TrendingUp },
  { page: 'leads', label: 'Signup leads', icon: UserPlus },
  { page: 'plans', label: 'Plans & pricing', icon: Package },
  { page: 'coupons', label: 'Coupons', icon: TicketPercent },
  { page: 'notifications', label: 'Notifications', icon: Bell },
];

const ROLE_LABELS: Record<string, string> = { super_admin: 'Super admin', support: 'Support', read_only: 'Read only' };

export function Shell({ session, page, onSignedOut, children }: {
  session: AdminSession;
  page: Page;
  onSignedOut: () => void;
  children: ReactNode;
}) {
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [live, setLive] = useState<Omit<LiveState, 'connected'>>({ version: 0, lastEvent: null });

  const refreshPending = useCallback(() => {
    accessRequestApi.list({ status: 'pending' }).then((list) => setPending(list.counts.pending)).catch(() => undefined);
  }, []);
  useEffect(refreshPending, [refreshPending]);

  const connected = useAdminEvents((event) => {
    setLive((state) => ({ version: state.version + 1, lastEvent: event }));
    refreshPending();
    if (event.type === 'access_request.created') {
      playChime();
      toast({
        tone: 'info',
        title: 'New access request',
        description: 'A business just asked for free access.',
        action: { label: 'Review', onClick: () => navigate('requests', `?request=${event.id}`) },
      });
    }
    if (event.type === 'billing_order.updated' && (event.status === 'provisioned' || event.status === 'review')) {
      playChime();
      toast({
        tone: event.status === 'provisioned' ? 'success' : 'info',
        title: event.status === 'provisioned' ? 'New paid signup' : 'Payment needs review',
        description: event.status === 'provisioned' ? 'A customer paid and their workspace was created.' : 'Paid, but the email already has a login.',
        action: { label: 'View revenue', onClick: () => navigate('revenue') },
      });
    }
    if (event.type === 'billing_order.updated' && (event.status === 'abandoned' || event.status === 'payment_failed')) {
      playChime();
      toast({
        tone: 'info',
        title: 'New signup lead',
        description: event.status === 'abandoned' ? 'Someone closed the checkout without paying.' : 'A payment attempt failed.',
        action: { label: 'View leads', onClick: () => navigate('leads') },
      });
    }
  });

  async function signOut() {
    await adminApi.logout().catch(() => undefined);
    onSignedOut();
  }

  const user = session.adminUser;
  const role = ROLE_LABELS[session.roles[0]] ?? 'No role';

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <div className="min-w-0">
          <img src={LOGO} alt="Bolega India" className="h-8 w-auto" />
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary"><ShieldCheck className="h-3 w-3" /> Admin console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Admin">
        {NAV.map(({ page: target, label, icon: Icon }) => {
          const active = page === target;
          const badge = target === 'requests' ? pending : 0;
          return (
            <a
              key={target}
              href={PAGE_PATHS[target]}
              onClick={(e) => { e.preventDefault(); navigate(target); setMobileOpen(false); }}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-primary-soft font-semibold text-primary' : badge ? 'border border-warning/20 bg-warning-surface/70 text-ink hover:bg-warning-surface' : 'text-subtle hover:bg-background hover:text-ink',
              )}
            >
              <Icon className={cx('h-4 w-4 shrink-0', active ? 'text-primary' : badge ? 'text-warning' : 'text-subtle')} />
              <span className="flex-1">{label}</span>
              {badge > 0 && (
                <span className="inline-flex h-5 min-w-5 animate-pulse items-center justify-center rounded-full bg-orange px-1.5 text-xs font-bold text-white ring-2 ring-orange/25">
                  {badge}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      <div className="mx-3 mb-3 rounded-2xl border border-line bg-background/60 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-subtle">
          <span className={cx('h-2 w-2 rounded-full', connected ? 'bg-success' : 'animate-pulse bg-warning')} />
          {connected ? 'Live updates on' : 'Connecting to live updates…'}
        </p>
      </div>

      <div className="space-y-1 border-t border-line px-3 py-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-lime">{initials(user.displayName)}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.displayName}</p>
            <p className="truncate text-[11px] text-subtle">{role} · {user.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-subtle transition-colors hover:bg-danger-surface hover:text-danger"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <LiveContext.Provider value={{ connected, ...live }}>
      <div className="flex h-full flex-col overflow-hidden md:flex-row">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4 md:hidden">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><img src={LOGO} alt="Bolega India" className="h-6 w-auto" /> Admin</p>
          <button type="button" aria-label="Open menu" className="rounded-lg p-2 hover:bg-background" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
            <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-2xl">
              <button type="button" aria-label="Close menu" className="absolute right-3 top-3 rounded-lg p-2 hover:bg-background" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </button>
              {sidebar}
            </aside>
          </div>
        )}

        <aside className="hidden w-64 shrink-0 border-r border-line bg-surface md:block">{sidebar}</aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </LiveContext.Provider>
  );
}
