import { google } from 'googleapis';
import { CalendarAdapter, TimeSlot, BookingDetails } from './calendarInterface';
import { config } from '../../config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

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

  async checkAvailability(date: string, ownerId: string): Promise<TimeSlot[]> {
    const calendar = await this.getAuthenticatedClient(ownerId);
    
    // Fetch primary calendar's time zone settings
    const cal = await calendar.calendars.get({ calendarId: 'primary' });
    const timeZone = cal.data.timeZone || 'UTC';

    // Helper to construct a Date object representing local time in the target timezone
    const getUtcDate = (dateStr: string, timeStr: string, tz: string): Date => {
      const localDate = new Date(`${dateStr}T${timeStr}`);
      const invDate = new Date(localDate.toLocaleString('en-US', { timeZone: tz }));
      const diff = localDate.getTime() - invDate.getTime();
      return new Date(localDate.getTime() + diff);
    };

    // Calculate start (9 AM) and end (5 PM) of workday in calendar's time zone
    const timeMin = getUtcDate(date, '09:00:00', timeZone);
    const timeMax = getUtcDate(date, '17:00:00', timeZone);
    
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: 'primary' }]
      }
    });

    const busySlots = res.data.calendars?.['primary']?.busy || [];
    
    // In a real app, we'd subtract busySlots from the 9-5 work hours to return free TimeSlots.
    // For simplicity of this MVP, we just return some hardcoded slots if not busy, 
    // or properly compute them. Here we compute available 30 min slots:
    const freeSlots: TimeSlot[] = [];
    let current = timeMin.getTime();
    const end = timeMax.getTime();
    
    while (current + 30 * 60000 <= end) {
      const slotStart = current;
      const slotEnd = current + 30 * 60000;
      
      const isBusy = busySlots.some(busy => {
        const bStart = new Date(busy.start!).getTime();
        const bEnd = new Date(busy.end!).getTime();
        return (slotStart < bEnd && slotEnd > bStart); // Overlap
      });

      if (!isBusy) {
        freeSlots.push({
          start: new Date(slotStart).toISOString(),
          end: new Date(slotEnd).toISOString()
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
