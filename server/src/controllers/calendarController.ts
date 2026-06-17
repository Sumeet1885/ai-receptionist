import { Request, Response } from 'express';
import { GoogleCalendarAdapter } from '../services/calendar/googleCalendar';
import { OutlookCalendarAdapter } from '../services/calendar/outlookCalendar';
import { CalendarAdapter } from '../services/calendar/calendarInterface';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import WebSocket from 'ws';
import { wsTransport } from '../utils/wsTransport';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  realtime: { transport: wsTransport },
});

function getAdapter(provider: string): CalendarAdapter {
  if (provider === 'google') return new GoogleCalendarAdapter();
  if (provider === 'outlook') return new OutlookCalendarAdapter();
  throw new Error(`Unsupported provider: ${provider}`);
}

export const getAuthUrl = (req: any, res: Response) => {
  const provider = req.query.provider as string;
  const ownerId = req.user.id; // from auth middleware

  try {
    const adapter = getAdapter(provider);
    const url = adapter.getAuthUrl(ownerId);
    res.json({ url });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const handleCallback = async (req: Request, res: Response) => {
  const provider = req.params.provider;
  const code = req.query.code as string;
  const ownerId = req.query.state as string;

  try {
    const adapter = getAdapter(provider);
    await adapter.handleCallback(code, ownerId);
    // Redirect back to dashboard appointments tab
    res.redirect(`${config.clientUrl}/dashboard?tab=appointments`);
  } catch (err: any) {
    console.error(`Callback error [${provider}]:`, err);
    res.redirect(`${config.clientUrl}/dashboard?tab=appointments&error=auth_failed`);
  }
};

export const getStatus = async (req: any, res: Response) => {
  const ownerId = req.user.id;
  try {
    const { data } = await supabase
      .from('calendar_connections')
      .select('id, provider')
      .eq('owner_id', ownerId)
      .maybeSingle();
      
    res.json({ connected: !!data, provider: data?.provider });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// Internal API used by Edge Functions for LLM function calling
export const getAvailability = async (req: Request, res: Response) => {
  const { date, ownerId } = req.query;
  try {
    const { data } = await supabase.from('calendar_connections').select('provider').eq('owner_id', ownerId).single();
    if (!data) throw new Error('No calendar connected');

    const adapter = getAdapter(data.provider);
    const slots = await adapter.checkAvailability(date as string, ownerId as string);
    res.json({ slots });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const bookAppointment = async (req: Request, res: Response) => {
  const { details, ownerId, botId, sessionId, leadId } = req.body;
  try {
    const requestedStart = new Date(details?.startTime);
    const requestedEnd = new Date(details?.endTime);
    if (!details?.startTime || !details?.endTime || Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime())) {
      return res.status(400).json({ error: 'A valid startTime and endTime are required before booking.' });
    }

    // Check if an appointment has already been booked for this session to enforce single-booking limit
    if (sessionId) {
      const { data: existingAppts } = await supabase
        .from('appointments')
        .select('id')
        .eq('session_id', sessionId);
      if (existingAppts && existingAppts.length > 0) {
        return res.status(400).json({ error: 'An appointment has already been booked for this session.' });
      }
    }

    const { data } = await supabase.from('calendar_connections').select('provider').eq('owner_id', ownerId).single();
    if (!data) throw new Error('No calendar connected');

    const adapter = getAdapter(data.provider);
    const requestedLocalDate = details.startTime.slice(0, 10);
    const availableSlots = await adapter.checkAvailability(requestedLocalDate, ownerId);
    const requestedStartMs = requestedStart.getTime();
    const requestedEndMs = requestedEnd.getTime();
    const exactAvailableSlot = availableSlots.some(slot =>
      new Date(slot.start).getTime() === requestedStartMs &&
      new Date(slot.end).getTime() === requestedEndMs
    );

    if (!exactAvailableSlot) {
      return res.status(400).json({
        error: 'The requested slot is not available during office hours.',
        slots: availableSlots
      });
    }

    const { eventId } = await adapter.bookAppointment(details, ownerId);

    // Save in our DB
    const { error } = await supabase.from('appointments').insert({
      bot_id: botId,
      session_id: sessionId,
      lead_id: leadId,
      title: details.title,
      visitor_name: details.visitorName,
      visitor_phone: details.visitorPhone,
      start_time: details.startTime,
      end_time: details.endTime,
      status: 'confirmed',
      calendar_event_id: eventId
    });

    if (error) throw error;

    res.json({ success: true, eventId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
