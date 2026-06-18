import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icons } from '../common/Icons';
import { supabase } from '../../lib/supabaseClient';
import { Appointment } from '../../types';
import { groupAppointments, mapAppointment } from '../../lib/appointments';

type ConnectionState = 'loading' | 'connected' | 'disconnected' | 'error';

function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const start = new Date(appointment.startTime);
  return (
    <article className="rounded-lg border border-brand-border bg-brand-bg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h5 className="text-sm font-bold text-brand-text truncate">{appointment.title}</h5>
          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${
            appointment.status === 'confirmed'
              ? 'text-brand-success border-brand-success/30 bg-brand-success/10'
              : 'text-brand-muted border-brand-border bg-brand-card'
          }`}>
            {appointment.status}
          </span>
        </div>
        <p className="text-xs text-brand-muted mt-1">{appointment.visitorName} · {appointment.visitorPhone}</p>
      </div>
      <div className="sm:text-right shrink-0">
        <p className="text-sm font-semibold text-brand-text">
          {start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
        </p>
        <p className="text-xs text-brand-accent mt-0.5">
          {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </article>
  );
}

export const AppointmentsTab: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading');
  const [provider, setProvider] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';

  const loadConnection = useCallback(async () => {
    setConnectionState('loading');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setConnectionState('error');
      return;
    }

    try {
      const response = await fetch(`${expressUrl}/api/calendar/status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('Calendar connection status is unavailable.');
      const data = await response.json();
      setProvider(data.provider || null);
      setConnectionState(data.connected ? 'connected' : 'disconnected');
    } catch (error) {
      console.error(error);
      setConnectionState('error');
    }
  }, [expressUrl]);

  const loadAppointments = useCallback(async () => {
    setLoadingAppointments(true);
    setAppointmentsError(null);
    const { data, error } = await supabase
      .from('appointments')
      .select('id, bot_id, session_id, lead_id, title, visitor_name, visitor_phone, start_time, end_time, status, created_at')
      .order('start_time', { ascending: true });

    if (error || !data) {
      setAppointments([]);
      setAppointmentsError(error?.message || 'Could not load appointments.');
    } else {
      setAppointments(data.map(mapAppointment));
    }
    setLoadingAppointments(false);
  }, []);

  const refresh = useCallback(() => {
    void loadConnection();
    void loadAppointments();
  }, [loadAppointments, loadConnection]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const grouped = useMemo(() => groupAppointments(appointments), [appointments]);

  const connectCalendar = async (targetProvider: 'google' | 'outlook') => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const response = await fetch(`${expressUrl}/api/calendar/auth-url?provider=${targetProvider}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      if (data.url) window.location.href = data.url;
    } catch (error) {
      console.error(error);
      setConnectionState('error');
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 sm:px-6 py-4 border-b border-brand-border flex items-center justify-between gap-3 bg-brand-bg/40">
          <div>
            <h3 className="font-display font-bold text-brand-text text-lg flex items-center gap-2"><Icons.Calendar /> Calendar</h3>
            <p className="text-xs text-brand-muted mt-1">Connection health and appointments booked by your receptionist.</p>
          </div>
          <button type="button" onClick={refresh} className="text-xs font-mono text-brand-accent hover:text-brand-accent-hover flex items-center gap-1">
            <Icons.Refresh /> Refresh
          </button>
        </div>

        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${connectionState === 'connected' ? 'bg-brand-success/10 border-brand-success/30 text-brand-success' : 'bg-brand-bg border-brand-border text-brand-muted'}`}>
              {connectionState === 'connected' ? <Icons.Check /> : <Icons.Calendar />}
            </div>
            <div>
              <p className="text-sm font-bold text-brand-text">
                {connectionState === 'connected' ? `${provider === 'google' ? 'Google' : 'Outlook'} Calendar connected` : connectionState === 'loading' ? 'Checking calendar connection…' : connectionState === 'error' ? 'Connection status unavailable' : 'Connect a calendar'}
              </p>
              <p className="text-xs text-brand-muted mt-0.5">
                {connectionState === 'connected' ? 'Availability checks and new bookings are active.' : 'Connect Google or Outlook to accept new bookings.'}
              </p>
            </div>
          </div>
          {connectionState !== 'connected' && (
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={() => connectCalendar('google')} className="h-10 px-4 rounded-lg bg-white text-gray-900 border border-gray-300 text-xs font-bold flex items-center justify-center gap-2"><Icons.Google /> Google</button>
              <button type="button" onClick={() => connectCalendar('outlook')} className="h-10 px-4 rounded-lg bg-[#0078d4] text-white text-xs font-bold flex items-center justify-center gap-2"><Icons.Microsoft /> Outlook</button>
            </div>
          )}
        </div>
      </section>

      <section className="bg-brand-card border border-brand-border rounded-xl p-5 sm:p-6 shadow-sm">
        {loadingAppointments ? (
          <div className="py-14 text-center text-sm text-brand-muted animate-pulse">Loading appointments…</div>
        ) : appointmentsError ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm font-semibold text-brand-text">Appointments could not be loaded</p>
            <p className="text-xs text-brand-muted">{appointmentsError}</p>
            <button type="button" onClick={() => void loadAppointments()} className="h-9 px-4 rounded-md bg-brand-accent text-brand-bg text-xs font-bold">Try again</button>
          </div>
        ) : appointments.length === 0 ? (
          <div className="py-14 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-brand-bg border border-brand-border text-brand-muted flex items-center justify-center"><Icons.Calendar /></div>
            <p className="text-sm font-semibold text-brand-text mt-4">No appointments yet</p>
            <p className="text-xs text-brand-muted mt-1">Bookings made by your receptionist will appear here.</p>
          </div>
        ) : (
          <div className="space-y-7">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-brand-text">Upcoming</h4>
                <span className="text-[10px] font-mono text-brand-muted">{grouped.upcoming.length} booking{grouped.upcoming.length === 1 ? '' : 's'}</span>
              </div>
              {grouped.upcoming.length ? <div className="space-y-2">{grouped.upcoming.map(appointment => <AppointmentCard key={appointment.id} appointment={appointment} />)}</div> : <p className="text-xs text-brand-muted py-4">No upcoming appointments.</p>}
            </div>
            {grouped.past.length > 0 && (
              <div className="pt-6 border-t border-brand-border">
                <div className="flex items-center justify-between mb-3"><h4 className="text-sm font-bold text-brand-text">Past</h4><span className="text-[10px] font-mono text-brand-muted">Most recent first</span></div>
                <div className="space-y-2 opacity-80">{grouped.past.map(appointment => <AppointmentCard key={appointment.id} appointment={appointment} />)}</div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
