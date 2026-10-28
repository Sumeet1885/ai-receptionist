export const DISPLAY_TIME_ZONE = 'Asia/Kolkata';

export function formatDateTimeIST(value: string | Date | null | undefined): string {
  if (!value) return '\u2014';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '\u2014';
  return `${date.toLocaleString('en-IN', { timeZone: DISPLAY_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })} IST`;
}

/** Expiry is exclusive at midnight; show the last accessible minute on the preceding day. */
export function formatExpiryIST(value: string | null | undefined): string {
  if (!value) return '\u2014';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '\u2014';
  const ist = new Date(date.getTime() + 330 * 60_000);
  return formatDateTimeIST(ist.getUTCHours() === 0 && ist.getUTCMinutes() === 0 && ist.getUTCSeconds() === 0 && ist.getUTCMilliseconds() === 0 ? new Date(date.getTime() - 1) : date);
}

export function istDate(value: Date = new Date()): string {
  return new Date(value.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function validISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** Calendar months clamp to the destination month's last day, including leap years. */
export function workspacePeriodEnd(start: string | Date, { days = 0, months = 0, endDate }: { days?: number; months?: number; endDate?: string } = { months: 1 }): string {
  let day = istDate(new Date(start));
  if (endDate) {
    if (!validISODate(endDate)) throw new Error('Enter a valid expiry date.');
    day = endDate;
  } else {
    const target = new Date(`${day}T00:00:00Z`);
    const originalDay = target.getUTCDate();
    target.setUTCDate(1);
    target.setUTCMonth(target.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(originalDay, lastDay) + days);
    day = target.toISOString().slice(0, 10);
  }
  return new Date(Date.parse(`${day}T00:00:00+05:30`) + 86400_000).toISOString();
}
