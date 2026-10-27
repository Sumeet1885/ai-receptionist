import { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, ChevronRight, Clock3, Inbox, PhoneCall, Sparkles, XCircle } from 'lucide-react';
import { accessRequestApi, type AccessRequestList, type AccessRequestStatus, type AdminSession } from '../api';
import { useLive } from '../live';
import { navigate } from '../router';
import { Button, Card, StatusBadge, STATUS_LABELS, initials, timeAgo, cx } from '../ui';

const KPIS: Array<{ status: AccessRequestStatus; icon: typeof Inbox; tone: string; bar: string }> = [
  { status: 'pending', icon: Clock3, tone: 'bg-warning-surface text-warning', bar: 'bg-orange' },
  { status: 'contacted', icon: PhoneCall, tone: 'bg-info-surface text-info', bar: 'bg-info' },
  { status: 'approved', icon: CheckCircle2, tone: 'bg-success-surface text-success', bar: 'bg-primary' },
  { status: 'rejected', icon: XCircle, tone: 'bg-danger-surface text-danger', bar: 'bg-danger/70' },
];

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function Overview({ session }: { session: AdminSession }) {
  const { version } = useLive();
  const [data, setData] = useState<AccessRequestList | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    accessRequestApi.list({ status: 'pending' })
      .then((list) => { setData(list); setError(''); })
      .catch((err) => setError((err as Error).message));
  }, [version]);

  const counts = data?.counts;
  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0;
  const firstName = session.adminUser.displayName.split(' ')[0];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-ink p-7 text-white shadow-card md:p-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-lime/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-40 h-40 w-40 rounded-full bg-primary/60 blur-3xl" />
        <div className="relative">
          <p className="flex items-center gap-2 text-sm font-medium text-lime"><Sparkles className="h-4 w-4" /> Admin console</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">{greeting()}, {firstName}</h1>
          <p className="mt-2 max-w-xl text-sm text-white/75">
            {counts?.pending
              ? <>You have <span className="font-semibold text-lime">{counts.pending} access request{counts.pending === 1 ? '' : 's'}</span> waiting for review.</>
              : 'No requests are waiting. New ones appear here the moment they arrive.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="lime" onClick={() => navigate('requests')}>
              <Inbox className="h-4 w-4" /> Review requests
            </Button>
            <Button variant="glass" onClick={() => navigate('requests', '?status=all')}>
              All requests <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl bg-danger-surface px-4 py-3 text-sm text-danger">{error}</p>}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPIS.map(({ status, icon: Icon, tone }) => (
          <button
            key={status}
            type="button"
            onClick={() => navigate('requests', `?status=${status}`)}
            className="group cursor-pointer rounded-2xl border border-line bg-surface p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30"
          >
            <span className={cx('flex h-10 w-10 items-center justify-center rounded-xl', tone)}><Icon className="h-5 w-5" /></span>
            <p className="mt-4 font-display text-3xl font-bold tracking-tight">{counts ? counts[status] : '–'}</p>
            <p className="mt-1 flex items-center justify-between text-sm text-subtle">
              {STATUS_LABELS[status]}
              <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
            </p>
          </button>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-display text-lg font-bold">Request pipeline</h2>
          <p className="mt-1 text-sm text-subtle">{total} request{total === 1 ? '' : 's'} so far</p>
          <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-background">
            {counts && total > 0 && KPIS.map(({ status, bar }) => (
              <span key={status} className={bar} style={{ width: `${(counts[status] / total) * 100}%` }} title={`${STATUS_LABELS[status]}: ${counts[status]}`} />
            ))}
          </div>
          <ul className="mt-5 space-y-3">
            {KPIS.map(({ status, bar }) => (
              <li key={status} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className={cx('h-2.5 w-2.5 rounded-full', bar)} /> {STATUS_LABELS[status]}</span>
                <span className="font-semibold">
                  {counts ? counts[status] : '–'}
                  <span className="ml-2 text-xs font-normal text-subtle">{counts && total ? `${Math.round((counts[status] / total) * 100)}%` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="overflow-hidden lg:col-span-3">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-lg font-bold">Needs your attention</h2>
              <p className="text-sm text-subtle">Newest pending requests</p>
            </div>
            <button type="button" onClick={() => navigate('requests')} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              View all <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {!data ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-background" />)}</div>
          ) : data.rows.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success-surface text-success"><CheckCircle2 className="h-6 w-6" /></span>
              <p className="mt-3 font-semibold">All caught up</p>
              <p className="text-sm text-subtle">Nothing is waiting for review.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.rows.slice(0, 6).map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => navigate('requests', `?request=${row.id}`)}
                    className="flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-background"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-sm font-bold text-primary">{initials(row.business_name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{row.business_name}</span>
                      <span className="block truncate text-xs text-subtle">{row.full_name} · {row.industry}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={row.status} />
                      <span className="text-[11px] text-subtle">{timeAgo(row.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
