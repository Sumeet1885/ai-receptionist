import { google } from 'googleapis';
import { CalendarAdapter, TimeSlot, BookingDetails } from './calendarInterface';
import { config } from '../../config';
import { supabase } from '../db';
import { getTimezoneOffsetString, normalizeTimezone, parseDateToYYYYMMDD } from '../../utils/date';

const formatInTimezone = (date: Date, tz?: string): string => {
  const resolvedTz = normalizeTimezone(tz, 'Asia/Kolkata');
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: resolvedTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
    
    let hour = getPart('hour');
    if (hour === '24') hour = '00';
    
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const minute = getPart('minute');
    const second = getPart('second');

    const offset = getTimezoneOffsetString(resolvedTz, date);
    return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
  } catch {
    return date.toISOString();
  }
};

export class GoogleCalendarAdapter implements CalendarAdapter {
  private getOAuthClient() {
    return new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
  }

  getAuthUrl(ownerId: string): string {
    const oauth2Client = this.getOAuthClient();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'],
      state: ownerId
    });
  }

  async handleCallback(code: string, ownerId: string): Promise<void> {
    const oauth2Client = this.getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    
    // Calculate expiry date
    let expiresAt = null;
    if (tokens.expiry_date) {
      expiresAt = new Date(tokens.expiry_date).toISOString();
    }

    // Upsert into calendar_connections
    await supabase.from('calendar_connections').upsert({
      owner_id: ownerId,
      provider: 'google',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      calendar_id: 'primary',
      updated_at: new Date().toISOString()
    }, { onConflict: 'owner_id' });
  }

  private async getAuthenticatedClient(ownerId: string) {
    const { data, error } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('provider', 'google')
      .single();

    if (error || !data) throw new Error('No Google Calendar connection found for owner');

    const oauth2Client = this.getOAuthClient();
    oauth2Client.setCredentials({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: data.token_expires_at ? new Date(data.token_expires_at).getTime() : null,
    });

    // Handle token refresh automatically by listening to events
    oauth2Client.on('tokens', async (tokens) => {
      let expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : data.token_expires_at;
      await supabase.from('calendar_connections').update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || data.refresh_token, // might not be sent
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString()
      }).eq('id', data.id);
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  async checkAvailability(date: string, ownerId: string, timezone?: string): Promise<TimeSlot[]> {
    const calendar = await this.getAuthenticatedClient(ownerId);
    
    // Fetch primary calendar's time zone settings
    const cal = await calendar.calendars.get({ calendarId: 'primary' });
    const timeZone = cal.data.timeZone;

    const tz = normalizeTimezone(timezone || timeZone, 'Asia/Kolkata');
    const parsedDate = parseDateToYYYYMMDD(date);
    const offset = getTimezoneOffsetString(tz, new Date(`${parsedDate}T12:00:00Z`));

    const timeMin = new Date(`${parsedDate}T00:00:00${offset}`);
    const timeMax = new Date(`${parsedDate}T23:59:59${offset}`);
    
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: 'primary' }]
      }
    });

    const busySlots = res.data.calendars?.['primary']?.busy || [];
    
    // Working hours: 09:00 to 18:00 in the target timezone
    const workStart = new Date(`${parsedDate}T09:00:00${offset}`).getTime();
    const workEnd = new Date(`${parsedDate}T18:00:00${offset}`).getTime();

    const freeSlots: TimeSlot[] = [];
    let current = workStart;
    
    while (current + 30 * 60000 <= workEnd) {
      const slotStart = current;
      const slotEnd = current + 30 * 60000;
      
      const isBusy = busySlots.some(busy => {
        const bStart = new Date(busy.start!).getTime();
        const bEnd = new Date(busy.end!).getTime();
        return (slotStart < bEnd && slotEnd > bStart); // Overlap
      });

      if (!isBusy) {
        freeSlots.push({
          start: formatInTimezone(new Date(slotStart), tz),
          end: formatInTimezone(new Date(slotEnd), tz)
        });
      }
      current += 30 * 60000;
    }

    return freeSlots;
  }

  async bookAppointment(details: BookingDetails, ownerId: string): Promise<{ eventId: string }> {
    const calendar = await this.getAuthenticatedClient(ownerId);
    
    // Check if the requested slot is free
    const checkRes = await calendar.freebusy.query({
      requestBody: {
        timeMin: new Date(details.startTime).toISOString(),
        timeMax: new Date(details.endTime).toISOString(),
        items: [{ id: 'primary' }]
      }
    });
    
    const busy = checkRes.data.calendars?.['primary']?.busy || [];
    const reqStart = new Date(details.startTime).getTime();
    const reqEnd = new Date(details.endTime).getTime();
    const hasOverlap = busy.some(b => {
      const bStart = new Date(b.start!).getTime();
      const bEnd = new Date(b.end!).getTime();
      return (reqStart < bEnd && reqEnd > bStart);
    });

    if (hasOverlap) {
      throw new Error('The requested slot is already booked.');
    }
    
    const event = {
      summary: details.title,
      description: `Appointment booked via AI Receptionist.\nName: ${details.visitorName}\nPhone: ${details.visitorPhone}`,
      start: {
        dateTime: details.startTime,
      },
      end: {
        dateTime: details.endTime,
      },
    };

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    return { eventId: res.data.id || 'unknown' };
  }
}
