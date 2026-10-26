import { CalendarAdapter } from './calendarInterface';
import { GoogleCalendarAdapter } from './googleCalendar';
import { OutlookCalendarAdapter } from './outlookCalendar';

export function getCalendarAdapter(provider: string): CalendarAdapter {
  if (provider === 'google') return new GoogleCalendarAdapter();
  if (provider === 'outlook') return new OutlookCalendarAdapter();
  throw new Error(`Unsupported provider: ${provider}`);
}
