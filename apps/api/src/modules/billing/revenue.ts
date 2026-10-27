import type { Currency } from './pricing';

// Revenue figures for the admin console, from paid orders. Amounts stay per currency (no
// conversion) and in minor units. Months are calendar months in India time.

export interface PaidOrder {
  total: number;
  currency: Currency;
  paid_at: string;
  plan_snapshot: { name: string } | null;
}

export interface LeadOrder {
  created_at: string;
  checkout_dismissed_at: string | null;
  payment_error: string | null;
}

type Money = Record<Currency, number>;
const zero = (): Money => ({ INR: 0, USD: 0 });
const IST_OFFSET_MS = 5.5 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

/** "2026-10" for the India-time month of an instant. */
function monthOf(time: number) {
  return new Date(time + IST_OFFSET_MS).toISOString().slice(0, 7);
}

function lastMonths(now: Date, count: number) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export function summariseRevenue(paid: PaidOrder[], leads: LeadOrder[], now = new Date()) {
  const thisMonth = monthOf(now.getTime());
  const since30 = now.getTime() - 30 * DAY_MS;

  const totals = { allTime: zero(), thisMonth: zero(), last30Days: zero() };
  const counts = { allTime: 0, thisMonth: 0, last30Days: 0 };
  const months = lastMonths(now, 6);
  const monthly = new Map(months.map((month) => [month, { month, ...zero(), count: 0 }]));
  const plans = new Map<string, { plan: string; count: number } & Money>();

  for (const order of paid) {
    const time = Date.parse(order.paid_at);
    totals.allTime[order.currency] += order.total;
    counts.allTime += 1;
    if (monthOf(time) === thisMonth) {
      totals.thisMonth[order.currency] += order.total;
      counts.thisMonth += 1;
    }
    if (time >= since30) {
      totals.last30Days[order.currency] += order.total;
      counts.last30Days += 1;
    }
    const bucket = monthly.get(monthOf(time));
    if (bucket) {
      bucket[order.currency] += order.total;
      bucket.count += 1;
    }
    const name = order.plan_snapshot?.name ?? 'Unknown plan';
    const plan = plans.get(name) ?? { plan: name, count: 0, ...zero() };
    plan.count += 1;
    plan[order.currency] += order.total;
    plans.set(name, plan);
  }

  // Leads are checkouts that were never paid; conversion is over the last 30 days.
  const recentLeads = leads.filter((lead) => Date.parse(lead.created_at) >= since30);
  const leadCounts = {
    open: leads.length,
    closed: leads.filter((lead) => lead.checkout_dismissed_at && !lead.payment_error).length,
    failed: leads.filter((lead) => lead.payment_error).length,
    last30Days: recentLeads.length,
  };
  const attempts = counts.last30Days + recentLeads.length;

  return {
    totals,
    counts,
    monthly: [...monthly.values()],
    byPlan: [...plans.values()].sort((a, b) => b.count - a.count),
    leads: leadCounts,
    conversionLast30Days: attempts ? Math.round((counts.last30Days / attempts) * 1000) / 10 : null,
  };
}

export type RevenueSummary = ReturnType<typeof summariseRevenue>;
