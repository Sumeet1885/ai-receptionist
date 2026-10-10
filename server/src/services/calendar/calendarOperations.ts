import { BookingDetails, CalendarAdapter, TimeSlot } from './calendarInterface';
import { getCalendarAdapter } from './calendarAdapterFactory';
import { validateContactInput } from '../../utils/contactValidation';
import { getTimezoneOffsetString, normalizeTimezone, parseDateToYYYYMMDD } from '../../utils/date';

type AdapterFactory = (provider: string) => CalendarAdapter;
const inFlightBookingSessions = new Set<string>();

function normalizeTimestampToTimezone(isoString: string, timezone: string): string {
  if (!isoString || !timezone) return isoString;
  const normTz = normalizeTimezone(timezone, 'Asia/Kolkata');
  const trimmed = isoString.trim();

  // If already has a non-zero offset like +05:30 or -04:00 (not Z and not +00:00)
  const hasSpecificOffset = /[+-](?!00:00)\d{2}:?\d{2}$/.test(trimmed);
  if (hasSpecificOffset) {
    return trimmed;
  }

  // Strip trailing Z or +00:00 and normalize space to T
  const cleanWallClock = trimmed.replace(/Z$/, '').replace(/[+-]00:00$/, '').replace(' ', 'T');
  const offset = getTimezoneOffsetString(normTz, new Date(cleanWallClock + 'Z'));
  return `${cleanWallClock}${offset}`;
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
  const normDate = parseDateToYYYYMMDD(dateStr);
  const requested = new Date(`${normDate}T00:00:00`);
  if (Number.isNaN(requested.getTime())) return;

  const normTz = normalizeTimezone(timezone, 'Asia/Kolkata');
  const todayInTz = new Date(new Date().toLocaleString('en-US', { timeZone: normTz }));
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
  const normDate = parseDateToYYYYMMDD(input.date);
  const normTz = normalizeTimezone(input.timezone, 'Asia/Kolkata');
  assertWithinBookingWindow(normDate, normTz, input.maxBookingDaysAhead);
  const adapter = await getConnectedAdapter(input.db, input.ownerId, input.getAdapter || getCalendarAdapter);
  return adapter.checkAvailability(normDate, input.ownerId, normTz);
}

export async function bookCalendarAppointment(input: BookingInput) {
  const { details, db, sessionId } = input;
  const normTz = normalizeTimezone(input.timezone, 'Asia/Kolkata');

  // Default title if omitted by model
  if (!details?.title) {
    details.title = details?.visitorName ? `Appointment with ${details.visitorName}` : 'Consultation Appointment';
  }

  // Auto-calculate endTime if model provided only startTime (default 30 min duration)
  if (!details?.endTime && details?.startTime) {
    const rawStart = new Date(details.startTime.replace(' ', 'T'));
    if (!Number.isNaN(rawStart.getTime())) {
      details.endTime = new Date(rawStart.getTime() + 30 * 60000).toISOString();
    }
  }

  if (details?.startTime) {
    details.startTime = normalizeTimestampToTimezone(details.startTime, normTz);
  }
  if (details?.endTime) {
    details.endTime = normalizeTimestampToTimezone(details.endTime, normTz);
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

    const requestedLocalDate = parseDateToYYYYMMDD(details.startTime.slice(0, 10));
    assertWithinBookingWindow(requestedLocalDate, normTz, input.maxBookingDaysAhead);

    const adapter = await getConnectedAdapter(db, input.ownerId, input.getAdapter || getCalendarAdapter);
    const availableSlots = await adapter.checkAvailability(requestedLocalDate, input.ownerId, normTz);

    if (!availableSlots || availableSlots.length === 0) {
      const error: any = new Error('No appointment slots are available on this date. Please choose another date.');
      error.slots = [];
      throw error;
    }

    // Flexible slot check: matches an available slot start, or requested slot falls in available window
    const isSlotAvailable = availableSlots.some(slot => {
      const slotStart = new Date(slot.start).getTime();
      const slotEnd = new Date(slot.end).getTime();
      return (
        (Math.abs(slotStart - requestedStart.getTime()) <= 60000 && Math.abs(slotEnd - requestedEnd.getTime()) <= 60000) ||
        (requestedStart.getTime() >= slotStart - 60000 && requestedStart.getTime() < slotEnd) ||
        (Math.abs(slotStart - requestedStart.getTime()) <= 30 * 60000)
      );
    });

    if (!isSlotAvailable) {
      const error: any = new Error('The requested time is outside available office hours. Please choose an available slot.');
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
