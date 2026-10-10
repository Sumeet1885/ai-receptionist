import { CalendarAdapter, TimeSlot, BookingDetails } from './calendarInterface';
import { config } from '../../config';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import { wsTransport } from '../../utils/wsTransport';
import { getTimezoneOffsetString, normalizeTimezone, parseDateToYYYYMMDD } from '../../utils/date';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  realtime: { transport: wsTransport },
});

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

export class OutlookCalendarAdapter implements CalendarAdapter {
  
  getAuthUrl(ownerId: string): string {
    const tenant = 'common';
    const clientId = config.microsoft.clientId;
    const redirectUri = encodeURIComponent(config.microsoft.redirectUri);
    const scope = encodeURIComponent('offline_access Calendars.ReadWrite User.Read');
    
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&response_mode=query&scope=${scope}&state=${ownerId}`;
  }

  async handleCallback(code: string, ownerId: string): Promise<void> {
    const tenant = 'common';
    const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
    
    const body = new URLSearchParams();
    body.append('client_id', config.microsoft.clientId);
    body.append('scope', 'offline_access Calendars.ReadWrite User.Read');
    body.append('code', code);
    body.append('redirect_uri', config.microsoft.redirectUri);
    body.append('grant_type', 'authorization_code');
    body.append('client_secret', config.microsoft.clientSecret);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const tokens = await res.json();
    if (!tokens.access_token) {
      throw new Error('Failed to get Outlook tokens');
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase.from('calendar_connections').upsert({
      owner_id: ownerId,
      provider: 'outlook',
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
      .eq('provider', 'outlook')
      .single();

    if (error || !data) throw new Error('No Outlook Calendar connection found for owner');

    // Refresh token if expired
    let accessToken = data.access_token;
    if (new Date(data.token_expires_at).getTime() < Date.now()) {
      // Need refresh
      const tenant = 'common';
      const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
      const body = new URLSearchParams();
      body.append('client_id', config.microsoft.clientId);
      body.append('scope', 'offline_access Calendars.ReadWrite User.Read');
      body.append('refresh_token', data.refresh_token);
      body.append('grant_type', 'refresh_token');
      body.append('client_secret', config.microsoft.clientSecret);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
      const tokens = await res.json();
      
      if (tokens.access_token) {
        accessToken = tokens.access_token;
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
        
        await supabase.from('calendar_connections').update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || data.refresh_token,
          token_expires_at: expiresAt,
          updated_at: new Date().toISOString()
        }).eq('id', data.id);
      }
    }

    return Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      }
    });
  }

  async checkAvailability(date: string, ownerId: string, timezone?: string): Promise<TimeSlot[]> {
    const client = await this.getAuthenticatedClient(ownerId);
    
    const tz = normalizeTimezone(timezone, 'Asia/Kolkata');
    const parsedDate = parseDateToYYYYMMDD(date);
    const offset = getTimezoneOffsetString(tz, new Date(`${parsedDate}T12:00:00Z`));

    const timeMin = new Date(`${parsedDate}T00:00:00${offset}`);
    const timeMax = new Date(`${parsedDate}T23:59:59${offset}`);

    try {
      await client.api('/me/calendar/getSchedule').post({
        schedules: ['primary'],
        startTime: {
          dateTime: timeMin.toISOString(),
          timeZone: 'UTC'
        },
        endTime: {
          dateTime: timeMax.toISOString(),
          timeZone: 'UTC'
        },
        availabilityViewInterval: 30
      });
    } catch {
      // Gracefully fall back to local computation if getSchedule fails
    }

    // Working hours: 09:00 to 18:00 in the target timezone
    const workStart = new Date(`${parsedDate}T09:00:00${offset}`).getTime();
    const workEnd = new Date(`${parsedDate}T18:00:00${offset}`).getTime();

    const freeSlots: TimeSlot[] = [];
    let current = workStart;
    while (current + 30 * 60000 <= workEnd) {
      freeSlots.push({
        start: formatInTimezone(new Date(current), tz),
        end: formatInTimezone(new Date(current + 30 * 60000), tz)
      });
      current += 30 * 60000;
    }

    return freeSlots;
  }

  async bookAppointment(details: BookingDetails, ownerId: string): Promise<{ eventId: string }> {
    const client = await this.getAuthenticatedClient(ownerId);
    
    const event = {
      subject: details.title,
      body: {
        contentType: 'HTML',
        content: `Appointment booked via AI Receptionist.<br>Name: ${details.visitorName}<br>Phone: ${details.visitorPhone}`
      },
      start: {
        dateTime: details.startTime,
        timeZone: 'UTC'
      },
      end: {
        dateTime: details.endTime,
        timeZone: 'UTC'
      }
    };

    const res = await client.api('/me/events').post(event);
    return { eventId: res.id };
  }
}
