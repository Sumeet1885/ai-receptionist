import type { Currency, PublicPlan } from './billingApi';

/** One card per configured plan pack. Never manufacture sizes or convert prices. */
export function configuredTopup(plan: PublicPlan, currency: Currency) {
  if (plan.contactSales) return null;
  const rawMinutes = plan.features.topup_minutes;
  const rawPrice = plan.features[currency === 'INR' ? 'topup_500_minutes' : 'topup_500_minutes_usd'];
  if (!rawMinutes || !/^\d+$/.test(rawMinutes) || !rawPrice || !/^\d+(\.\d{1,2})?$/.test(rawPrice.trim())) return null;
  const minutes = Number(rawMinutes), amount = Math.round(Number(rawPrice) * 100);
  const minimum = currency === 'INR' ? 100 : 50;
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 100000 || !Number.isSafeInteger(amount) || amount < minimum || amount > 100000000) return null;
  return { plan, minutes, amount };
}
