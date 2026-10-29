import { supabase } from '../../services/db';
import { MINIMUM_CHARGE, type Currency } from './pricing';

export interface MinuteSummary {
  planId: string | null; planName: string | null; planSlug: string | null; currency: Currency;
  isTrial: boolean; startsAt: string | null; expiresAt: string | null; active: boolean;
  includedMinutes: number | null; topupMinutes: number; usedMinutes: number; remainingMinutes: number | null;
  features: Record<string, string>;
}

export function topupOffer(features: Record<string, string>, currency: Currency) {
  // Existing admin-controlled feature prices are major units. Never accept a browser price.
  const raw = features[currency === 'INR' ? 'topup_500_minutes' : 'topup_500_minutes_usd'];
  if (typeof raw !== 'string' || !/^\d+(\.\d{1,2})?$/.test(raw.trim())) return null;
  const amount = Math.round(Number(raw) * 100);
  const rawMinutes = features.topup_minutes ?? '500';
  if (!/^\d+$/.test(rawMinutes)) return null;
  const minutes = Number(rawMinutes);
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 100000) return null;
  if (!Number.isSafeInteger(amount) || amount < MINIMUM_CHARGE[currency] || amount > 100_000_000) return null;
  return { minutes, amount, currency };
}

export async function getMinuteSummary(userId: string): Promise<MinuteSummary | null> {
  const { data, error } = await supabase.rpc('workspace_minute_summary', { p_user: userId });
  if (error) throw new Error(`Load workspace minutes: ${error.message}`);
  return data as MinuteSummary | null;
}

export async function callingMinutesAvailable(userId: string) {
  const summary = await getMinuteSummary(userId);
  return !!summary?.active && (summary.remainingMinutes === null || summary.remainingMinutes > 0);
}
