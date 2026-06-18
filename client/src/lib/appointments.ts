import { Appointment } from '../types';

export interface AppointmentRow {
  id: string;
  bot_id?: string | null;
  session_id?: string | null;
  lead_id?: string | null;
  title?: string | null;
  visitor_name?: string | null;
  visitor_phone?: string | null;
  start_time: string;
  end_time: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  created_at?: string | null;
}

export function mapAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    botId: row.bot_id || '',
    sessionId: row.session_id || '',
    leadId: row.lead_id || '',
    title: row.title || 'Appointment',
    visitorName: row.visitor_name || 'Visitor',
    visitorPhone: row.visitor_phone || 'Not provided',
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    createdAt: row.created_at || '',
  };
}

export function groupAppointments(appointments: Appointment[], now = new Date()) {
  const nowMs = now.getTime();
  const upcoming = appointments
    .filter(appointment => new Date(appointment.startTime).getTime() >= nowMs)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const past = appointments
    .filter(appointment => new Date(appointment.startTime).getTime() < nowMs)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  return { upcoming, past };
}

