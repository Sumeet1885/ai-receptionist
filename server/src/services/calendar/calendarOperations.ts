import { BookingDetails, CalendarAdapter, TimeSlot } from './calendarInterface';
import { getCalendarAdapter } from './calendarAdapterFactory';
import { validateContactInput } from '../../utils/contactValidation';

type AdapterFactory = (provider: string) => CalendarAdapter;
const inFlightBookingSessions = new Set<string>();

interface AvailabilityInput {
  db: any;
  ownerId: string;
  date: string;
  timezone?: string;
  getAdapter?: AdapterFactory;
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
}

export function serializeCalendarToolError(error: any) {
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
  const adapter = await getConnectedAdapter(input.db, input.ownerId, input.getAdapter || getCalendarAdapter);
  return adapter.checkAvailability(input.date, input.ownerId, input.timezone);
}

export async function bookCalendarAppointment(input: BookingInput) {
  const { details, db, sessionId } = input;
  const requestedStart = new Date(details?.startTime);
  const requestedEnd = new Date(details?.endTime);

  if (!sessionId) throw new Error('A valid chat session is required before booking');
  if (!details?.startTime || !details?.endTime || Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime())) {
    throw new Error('A valid startTime and endTime are required before booking.');
  }
  if (requestedEnd.getTime() <= requestedStart.getTime()) {
    throw new Error('Appointment endTime must be after startTime.');
  }

  // Strict Server-Side Validation: Ensure contact information is truly valid
  // before proceeding, ignoring hallucinated inputs.
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

    const adapter = await getConnectedAdapter(db, input.ownerId, input.getAdapter || getCalendarAdapter);
    const requestedLocalDate = details.startTime.slice(0, 10);
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
