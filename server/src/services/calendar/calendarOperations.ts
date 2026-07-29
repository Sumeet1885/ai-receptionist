import { BookingDetails, CalendarAdapter, TimeSlot } from './calendarInterface';
import { getCalendarAdapter } from './calendarAdapterFactory';
import { validateContactInput } from '../../utils/contactValidation';

type AdapterFactory = (provider: string) => CalendarAdapter;
const inFlightBookingSessions = new Set<string>();

function normalizeTimestampToTimezone(isoString: string, timezone: string): string {
  if (!isoString || !timezone) return isoString;

  const isUtcSuffix = /Z$/.test(isoString) || /[+-]00:00$/.test(isoString);
  if (!isUtcSuffix) return isoString;

  const wallClock = isoString.replace(/Z$/, '').replace(/[+-]00:00$/, '');


  try {
    const wallClockZ = wallClock + 'Z';
    const offsetParts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date(wallClockZ));
    const offsetStr = offsetParts.find(p => p.type === 'timeZoneName')?.value || '';
    const match = offsetStr.match(/GMT([+-])(\d+):?(\d+)?/);
    if (!match) return isoString; 
    const sign  = match[1];
    const hours = match[2].padStart(2, '0');
    const mins  = (match[3] || '00').padStart(2, '0');
    const offset = `${sign}${hours}:${mins}`;
    return `${wallClock}${offset}`;
  } catch {
    return isoString; 
  }
}

interface AvailabilityInput {
  db: any;
  ownerId: string;
  date: string;
  timezone?: string;
  getAdapter?: AdapterFactory;
  maxBookingDaysAhead?: number;
}

interface BookingInput {
  db: any;
  ownerId: string;
  botId: string;
  sessionId: string;
  leadId?: string;
  timezone?: string;
  details: BookingDetails;
  getAdapter?: AdapterFactory;
  maxBookingDaysAhead?: number;
}


function assertWithinBookingWindow(dateStr: string, timezone: string | undefined, maxBookingDaysAhead: number | undefined) {
  const requested = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(requested.getTime())) return;

  const todayInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone || 'UTC' }));
  const todayMidnight = new Date(todayInTz.getFullYear(), todayInTz.getMonth(), todayInTz.getDate());

  if (requested.getTime() < todayMidnight.getTime()) {
    throw new Error('That date is in the past. Please choose a date from today onward.');
  }

  if (!maxBookingDaysAhead || maxBookingDaysAhead <= 0) return;

  const maxDate = new Date(todayMidnight);
  maxDate.setDate(maxDate.getDate() + maxBookingDaysAhead);
  if (requested.getTime() > maxDate.getTime()) {
    throw new Error(`Appointments can only be booked up to ${maxBookingDaysAhead} day(s) ahead. Please choose a date on or before ${maxDate.toISOString().slice(0, 10)}.`);
  }
}

export function serializeCalendarToolError(error: any) {
  const providerError = error?.response?.data?.error || error?.error || error?.message;
  if (providerError === 'invalid_grant' || String(providerError || '').includes('invalid_grant')) {
    return {
      error: 'The business calendar connection has expired or was revoked. Please ask the business owner to reconnect Google Calendar before checking availability.',
      actionRequired: 'reconnect_calendar',
      ...(Array.isArray(error?.slots) ? { slots: error.slots } : {}),
    };
  }

  return {
    error: error?.message || 'Calendar operation failed',
    ...(Array.isArray(error?.slots) ? { slots: error.slots } : {}),
  };
}

async function getConnectedAdapter(db: any, ownerId: string, factory: AdapterFactory) {
  if (!ownerId) throw new Error('Calendar owner is required');

  const { data, error } = await db
    .from('calendar_connections')
    .select('provider')
    .eq('owner_id', ownerId)
    .single();

  if (error || !data?.provider) throw new Error('No calendar connected');
  return factory(data.provider);
}

export async function checkCalendarAvailability(input: AvailabilityInput): Promise<TimeSlot[]> {
  if (!input.date) throw new Error('A date is required to check availability');
  assertWithinBookingWindow(input.date, input.timezone, input.maxBookingDaysAhead);
  const adapter = await getConnectedAdapter(input.db, input.ownerId, input.getAdapter || getCalendarAdapter);
  return adapter.checkAvailability(input.date, input.ownerId, input.timezone);
}

export async function bookCalendarAppointment(input: BookingInput) {
  const { details, db, sessionId } = input;


  if (input.timezone && details?.startTime) {
    details.startTime = normalizeTimestampToTimezone(details.startTime, input.timezone);
  }
  if (input.timezone && details?.endTime) {
    details.endTime = normalizeTimestampToTimezone(details.endTime, input.timezone);
  }

  const requestedStart = new Date(details?.startTime);
  const requestedEnd = new Date(details?.endTime);

  if (!sessionId) throw new Error('A valid chat session is required before booking');
  if (!details?.startTime || !details?.endTime || Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime())) {
    throw new Error('A valid startTime and endTime are required before booking.');
  }
  if (requestedEnd.getTime() <= requestedStart.getTime()) {
    throw new Error('Appointment endTime must be after startTime.');
  }

  if (details.visitorPhone) {
    const phoneValidation = validateContactInput('phone', details.visitorPhone);
    if (!phoneValidation.valid) {
      throw new Error(`Invalid phone number: ${phoneValidation.error}`);
    }
    details.visitorPhone = phoneValidation.normalized;
  }
  
  if (details.visitorEmail) {
    const emailValidation = validateContactInput('email', details.visitorEmail);
    if (!emailValidation.valid) {
      throw new Error(`Invalid email address: ${emailValidation.error}`);
    }
    details.visitorEmail = emailValidation.normalized;
  }

  if (inFlightBookingSessions.has(sessionId)) {
    throw new Error('An appointment booking is already in progress for this session.');
  }
  inFlightBookingSessions.add(sessionId);

  try {
    const { data: existingAppointments, error: existingError } = await db
      .from('appointments')
      .select('id')
      .eq('session_id', sessionId);

    if (existingError) throw existingError;
    if (existingAppointments?.length) {
      throw new Error('An appointment has already been booked for this session.');
    }

    const requestedLocalDate = details.startTime.slice(0, 10);
    assertWithinBookingWindow(requestedLocalDate, input.timezone, input.maxBookingDaysAhead);

    const adapter = await getConnectedAdapter(db, input.ownerId, input.getAdapter || getCalendarAdapter);
    const availableSlots = await adapter.checkAvailability(requestedLocalDate, input.ownerId, input.timezone);
    const exactAvailableSlot = availableSlots.some(slot =>
      new Date(slot.start).getTime() === requestedStart.getTime()
      && new Date(slot.end).getTime() === requestedEnd.getTime()
    );

    if (!exactAvailableSlot) {
      const error: any = new Error('The requested slot is not available during office hours.');
      error.slots = availableSlots;
      throw error;
    }

    const { eventId } = await adapter.bookAppointment(details, input.ownerId);
    const { error: insertError } = await db.from('appointments').insert({
      bot_id: input.botId,
      session_id: sessionId,
      lead_id: input.leadId,
      title: details.title,
      visitor_name: details.visitorName,
      visitor_phone: details.visitorPhone,
      start_time: details.startTime,
      end_time: details.endTime,
      status: 'confirmed',
      calendar_event_id: eventId,
    });

    if (insertError) throw insertError;
    return { success: true, eventId };
  } finally {
    inFlightBookingSessions.delete(sessionId);
  }
}
