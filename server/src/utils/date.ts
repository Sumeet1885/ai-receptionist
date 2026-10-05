/**
 * Common timezone abbreviation aliases mapped to valid IANA timezone identifiers.
 */
const TIMEZONE_ALIASES: Record<string, string> = {
  IST: 'Asia/Kolkata',
  UST: 'UTC',
  UTC: 'UTC',
  GMT: 'UTC',
  Z: 'UTC',
  EST: 'America/New_York',
  EDT: 'America/New_York',
  ET: 'America/New_York',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  CT: 'America/Chicago',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  MT: 'America/Denver',
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  PT: 'America/Los_Angeles',
  BST: 'Europe/London',
  CET: 'Europe/Paris',
  CEST: 'Europe/Paris',
  JST: 'Asia/Tokyo',
  AEST: 'Australia/Sydney',
  AEDT: 'Australia/Sydney',
  SGT: 'Asia/Singapore',
  GST: 'Asia/Dubai',
};

/**
 * Normalizes input timezone strings (e.g. 'IST', 'UST', 'EST', 'Asia/Kolkata')
 * into guaranteed valid IANA timezone identifiers supported by Node.js Intl.
 */
export function normalizeTimezone(tz?: string | null, fallback = 'Asia/Kolkata'): string {
  if (!tz || typeof tz !== 'string') return fallback;
  const trimmed = tz.trim();
  const upper = trimmed.toUpperCase();

  const candidate = TIMEZONE_ALIASES[upper] || trimmed;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    // If candidate fails, try fallback
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: fallback });
      return fallback;
    } catch {
      return 'Asia/Kolkata';
    }
  }
}

/**
 * Parses date strings in various formats (DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, YYYY/MM/DD)
 * and normalizes them safely into standard 'YYYY-MM-DD' format.
 */
export function parseDateToYYYYMMDD(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();

  // If already starts with YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // If DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  return trimmed;
}

/**
 * Returns the ISO timezone offset string (e.g. '+05:30', '-05:00', '+00:00')
 * for the given timezone at the specified date.
 */
export function getTimezoneOffsetString(timezone: string, date: Date = new Date()): string {
  const normTz = normalizeTimezone(timezone);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: normTz,
      timeZoneName: 'longOffset',
    }).formatToParts(date);
    const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value || '';
    const match = offsetStr.match(/GMT([+-])(\d+):?(\d+)?/);
    if (!match) return '+00:00';
    const sign = match[1];
    const hours = match[2].padStart(2, '0');
    const mins = (match[3] || '00').padStart(2, '0');
    return `${sign}${hours}:${mins}`;
  } catch {
    return '+00:00';
  }
}

/**
 * Formats the current date and time in the given timezone into an unambiguous format
 * featuring both the DD-MM-YYYY format and the spelled-out month.
 * Example return: "Friday, 07-08-2026 (07 August 2026), 18:09:20"
 */
export function formatCurrentDateTime(timezone: string): string {
  const normTz = normalizeTimezone(timezone);
  try {
    const d = new Date();
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: normTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(d);
    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
    
    const day = partMap.day;
    const month = partMap.month;
    const year = partMap.year;
    const hour = partMap.hour;
    const minute = partMap.minute;
    const second = partMap.second;
    
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthIndex = parseInt(month, 10) - 1;
    const monthName = monthNames[monthIndex] || '';
    
    const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: normTz,
      weekday: 'long'
    });
    const weekday = weekdayFormatter.format(d);
    
    return `${weekday}, ${day}-${month}-${year} (${day} ${monthName} ${year}), ${hour}:${minute}:${second}`;
  } catch (error) {
    // Fallback in case of invalid timezone or runtime issue
    try {
      return new Date().toLocaleString('en-US', { timeZone: normTz });
    } catch {
      return new Date().toLocaleString();
    }
  }
}
