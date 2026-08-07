/**
 * Formats the current date and time in the given timezone into an unambiguous format
 * featuring both the DD-MM-YYYY format and the spelled-out month.
 * Example return: "Friday, 07-08-2026 (07 August 2026), 18:09:20"
 */
export function formatCurrentDateTime(timezone: string): string {
  try {
    const d = new Date();
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
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
      timeZone: timezone,
      weekday: 'long'
    });
    const weekday = weekdayFormatter.format(d);
    
    return `${weekday}, ${day}-${month}-${year} (${day} ${monthName} ${year}), ${hour}:${minute}:${second}`;
  } catch (error) {
    // Fallback in case of invalid timezone or runtime issue
    try {
      return new Date().toLocaleString('en-US', { timeZone: timezone });
    } catch {
      return new Date().toLocaleString();
    }
  }
}
