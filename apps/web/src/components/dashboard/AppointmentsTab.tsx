import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icons } from '../common/Icons';
import { WhatsAppButton } from '../common/WhatsAppButton';
import { supabase } from '../../lib/supabaseClient';
import { Appointment, Bot, WidgetConfig } from '../../types';
import { groupAppointments, mapAppointment } from '../../lib/appointments';
import { dograhApi } from '../../modules/phone-calls/dograhApi';

type ConnectionState = 'loading' | 'connected' | 'disconnected' | 'error';

export interface AppointmentsTabProps {
  bots?: Bot[];
  activeBot?: Bot | null;
  updateBot?: (id: string, updates: Partial<{ widgetConfig: WidgetConfig }>) => Promise<void>;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const start = new Date(appointment.startTime);
  const formattedTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <article className="group rounded-xl border border-brand-border bg-brand-bg/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-brand-accent/50 hover:-translate-y-1 hover:shadow-lg hover:shadow-brand-accent/5 transition-all duration-300 shadow-sm cursor-pointer">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h5 className="text-sm font-bold text-brand-text truncate group-hover:text-brand-accent transition-colors">{appointment.title}</h5>
          {appointment.status && appointment.status !== 'confirmed' && (
            <span className="px-2 py-0.5 rounded text-[10px] font-body font-bold uppercase tracking-wide border text-brand-muted border-brand-border bg-brand-card">
              {appointment.status}
            </span>
          )}
        </div>
        <p className="text-xs text-brand-muted font-body mt-1">👤 {appointment.visitorName} · 📞 {appointment.visitorPhone}</p>
      </div>
      <div className="flex items-center gap-4 shrink-0 sm:justify-end">
        <div className="text-left sm:text-right">
          <p className="text-xs font-semibold text-brand-text">
            {formattedDate}
          </p>
          <p className="text-xs text-brand-accent font-body font-bold">
            {formattedTime}
          </p>
        </div>
        <WhatsAppButton
          lead={{
            name: appointment.visitorName,
            phone: appointment.visitorPhone,
            appointmentStatus: `${formattedDate} at ${formattedTime}`,
          }}
          size="sm"
        />
      </div>
    </article>
  );
}

function getStartOfWeek(offsetWeeks = 0): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0 is Sun, 1 is Mon
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + (offsetWeeks * 7);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const AppointmentsTab: React.FC<AppointmentsTabProps> = ({
  bots,
  activeBot,
  updateBot,
  showToast
}) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading');
  const [provider, setProvider] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<boolean>(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [calendarViewMode, setCalendarViewMode] = useState<'grid' | 'list'>('grid');
  const [weekOffset, setWeekOffset] = useState<number>(0);

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

  // Compute 7 days of the active week
  const weekDays = useMemo(() => {
    const monday = getStartOfWeek(weekOffset);
    return Array.from({ length: 7 }).map((_, i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      return day;
    });
  }, [weekOffset]);

  const weekRangeLabel = useMemo(() => {
    if (weekDays.length === 0) return '';
    const start = weekDays[0];
    const end = weekDays[6];
    const startStr = start.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr} – ${endStr}`;
  }, [weekDays]);

  const isToday = (d: Date) => {
    const today = new Date();
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
  };

  const getAppointmentsForDay = (day: Date) => {
    return appointments.filter(app => {
      const appDate = new Date(app.startTime);
      return (
        appDate.getDate() === day.getDate() &&
        appDate.getMonth() === day.getMonth() &&
        appDate.getFullYear() === day.getFullYear()
      );
    });
  };

  const weekStats = useMemo(() => {
    const monday = weekDays[0];
    const sundayEnd = new Date(weekDays[6]);
    sundayEnd.setHours(23, 59, 59, 999);

    const weekList = appointments.filter(app => {
      const t = new Date(app.startTime).getTime();
      return t >= monday.getTime() && t <= sundayEnd.getTime();
    });

    const weekendVisits = weekList.filter(app => {
      const d = new Date(app.startTime).getDay();
      return d === 0 || d === 6; // Sunday or Saturday
    });

    return {
      total: weekList.length,
      weekend: weekendVisits.length,
    };
  }, [appointments, weekDays]);

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

  const handleDisconnect = async () => {
    const confirmed = window.confirm(
      'Disconnect your calendar?\n\nYour receptionist will no longer be able to check availability or automatically book appointments.'
    );
    if (!confirmed) return;

    setDisconnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${expressUrl}/api/calendar/connection`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || 'Failed to disconnect calendar');
      }

      setProvider(null);
      setConnectionState('disconnected');
    } catch (err: any) {
      console.error('[Calendar] Disconnect error:', err);
      alert(err.message || 'Could not disconnect. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Google & Outlook Calendar Integration Card - KEPT 100% INTACT */}
      <section className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 sm:px-6 py-4 border-b border-brand-border flex items-center justify-between gap-3 bg-brand-bg/40">
          <div>
            <h3 className="font-display font-bold text-brand-text text-lg flex items-center gap-2"><Icons.Calendar /> Calendar Sync</h3>
            <p className="text-xs text-brand-muted mt-1">Connection health and live calendar availability booked by your receptionist.</p>
          </div>
          <button type="button" onClick={refresh} className="text-xs font-body text-brand-accent hover:text-brand-accent-hover flex items-center gap-1">
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
          {connectionState === 'connected' ? (
            <button
              type="button"
              id="calendar-disconnect-btn"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="h-10 px-4 rounded-lg border border-red-500/30 text-red-700 hover:bg-red-500/10 text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect Calendar'}
            </button>
          ) : connectionState !== 'loading' && (
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={() => connectCalendar('google')} className="h-10 px-4 rounded-lg bg-white text-gray-900 border border-gray-300 text-xs font-bold flex items-center justify-center gap-2"><Icons.Google /> Google</button>
              <button type="button" onClick={() => connectCalendar('outlook')} className="h-10 px-4 rounded-lg bg-[#0078d4] text-white text-xs font-bold flex items-center justify-center gap-2"><Icons.Microsoft /> Outlook</button>
            </div>
          )}
        </div>

        {/* Receptionist Calendar Booking Toggle direct status section */}
        {connectionState !== 'loading' && (
          <div className="border-t border-brand-border bg-brand-bg/40 px-5 sm:px-6 py-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-body uppercase tracking-wider text-brand-muted">Receptionist Booking:</span>
                  <span className="text-sm font-bold text-brand-text">
                    {(activeBot || bots?.[0])?.businessName || 'AI Receptionist'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-body font-bold uppercase tracking-wider border flex items-center gap-1.5 ${connectionState === 'connected' && Boolean((activeBot || bots?.[0])?.widgetConfig.enableCalendar)
                        ? 'bg-brand-success/10 border-brand-success/30 text-brand-success'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-700'
                      }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${connectionState === 'connected' && Boolean((activeBot || bots?.[0])?.widgetConfig.enableCalendar) ? 'bg-brand-success' : 'bg-amber-400'}`} />
                    <span>
                      {connectionState === 'connected' && Boolean((activeBot || bots?.[0])?.widgetConfig.enableCalendar)
                        ? 'Toggle ON (Active)'
                        : 'Toggle OFF'}
                    </span>
                  </span>
                </div>
                <p className="text-xs text-brand-muted leading-relaxed">
                  {connectionState !== 'connected' ? (
                    <>
                      <strong className="text-amber-700">Calendar booking toggle is OFF.</strong> You must first connect Google or Outlook Calendar above to unlock and turn on automated booking.
                    </>
                  ) : (activeBot || bots?.[0])?.widgetConfig.enableCalendar ? (
                    <>
                      <strong className="text-brand-success">Calendar booking toggle is ON.</strong> Your receptionist will check live slot availability and book meetings directly into your connected calendar.
                    </>
                  ) : (
                    <>
                      <strong className="text-amber-700">Calendar booking toggle is OFF.</strong> Your calendar is connected, but the booking toggle is currently OFF. Turn it ON to start accepting bookings.
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {connectionState === 'connected' && (activeBot || bots?.[0]) && updateBot ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const targetBot = activeBot || bots?.[0];
                      if (!targetBot) return;
                      const nextVal = !targetBot.widgetConfig.enableCalendar;
                      await updateBot(targetBot.id, {
                        widgetConfig: { ...targetBot.widgetConfig, enableCalendar: nextVal }
                      });
                      dograhApi.provision(targetBot.id).catch(err => {
                        console.error('Failed to update phone agent on toggle change', err);
                      });
                      showToast?.(nextVal ? 'Calendar booking toggle turned ON' : 'Calendar booking toggle turned OFF');
                    }}
                    className={`h-9 px-4 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm ${(activeBot || bots?.[0])?.widgetConfig.enableCalendar
 ? 'bg-brand-card border border-brand-border hover:bg-brand-bg'
 : 'bg-brand-accent text-primary-foreground hover:bg-brand-accent-hover hover:text-primary-foreground '
 }`}
                  >
                    <span>{(activeBot || bots?.[0])?.widgetConfig.enableCalendar ? 'Turn OFF Booking' : 'Turn ON Booking'}</span>
                  </button>
                ) : (
                  <div className="h-9 px-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-body flex items-center gap-1.5 select-none">
                    <span>🔒</span>
                    <span>Toggle Locked OFF</span>
                  </div>
                )}

                {(activeBot || bots?.[0]) && (
                  <button
                    type="button"
                    onClick={() => {
                      const botId = (activeBot || bots?.[0])?.id;
                      window.history.pushState({}, '', `/agents/${botId}/knowledge?section=behavior`);
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }}
                    className="h-9 px-3 rounded-md border border-brand-border bg-brand-card hover:bg-brand-bg text-brand-text text-xs font-semibold transition cursor-pointer"
                  >
                    Agent Settings →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Booked Appointments View Section */}
      <section className="bg-brand-card border border-brand-border rounded-xl p-5 sm:p-6 shadow-sm">
        {/* Header with View Toggle & Week Navigator */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-brand-border mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-bold text-brand-text flex items-center gap-2">
                <span>Site Visit Schedule</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-body bg-brand-accent/10 border border-brand-accent/30 text-brand-accent">
                  {appointments.length} Booked
                </span>
              </h4>
            </div>
            <p className="text-xs text-brand-muted mt-0.5">
              Customer appointments scheduled by your receptionist with 1-click WhatsApp follow-ups.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto flex-wrap">
            {/* View Toggle */}
            <div className="inline-flex rounded-lg border border-brand-border bg-brand-bg/80 p-1 text-xs">
              <button
                type="button"
                onClick={() => setCalendarViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${calendarViewMode === 'grid'
                    ? 'bg-brand-card text-brand-accent shadow-sm border border-brand-border'
                    : 'text-brand-muted hover:text-brand-text'
                  }`}
              >
                <span>📅 Weekly Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setCalendarViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${calendarViewMode === 'list'
                    ? 'bg-brand-card text-brand-accent shadow-sm border border-brand-border'
                    : 'text-brand-muted hover:text-brand-text'
                  }`}
              >
                <span>📝 List View</span>
              </button>
            </div>
          </div>
        </div>

        {loadingAppointments ? (
          <div className="py-14 text-center text-sm text-brand-muted animate-pulse">Loading appointments…</div>
        ) : appointmentsError ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm font-semibold text-brand-text">Appointments could not be loaded</p>
            <p className="text-xs text-brand-muted">{appointmentsError}</p>
            <button type="button" onClick={() => void loadAppointments()} className="h-9 px-4 rounded-md bg-brand-accent text-primary-foreground text-xs font-bold">Try again</button>
          </div>
        ) : appointments.length === 0 ? (
          <div className="py-14 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-brand-bg border border-brand-border text-brand-muted flex items-center justify-center"><Icons.Calendar /></div>
            <p className="text-sm font-semibold text-brand-text mt-4">No appointments yet</p>
            <p className="text-xs text-brand-muted mt-1">Bookings made by Priya during caller conversations will appear here automatically.</p>
          </div>
        ) : calendarViewMode === 'grid' ? (
          /* Weekly Visual Schedule View */
          <div className="space-y-4">
            {/* Week navigation bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-brand-bg/60 p-3 rounded-lg border border-brand-border">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWeekOffset(prev => prev - 1)}
                  className="h-8 px-2.5 rounded border border-brand-border bg-brand-card hover:bg-brand-bg text-brand-text text-xs font-semibold flex items-center gap-1 transition"
                  title="Previous Week"
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  className={`h-8 px-3 rounded text-xs font-semibold transition border ${weekOffset === 0
                      ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
                      : 'border-brand-border bg-brand-card hover:bg-brand-bg text-brand-text'
                    }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setWeekOffset(prev => prev + 1)}
                  className="h-8 px-2.5 rounded border border-brand-border bg-brand-card hover:bg-brand-bg text-brand-text text-xs font-semibold flex items-center gap-1 transition"
                  title="Next Week"
                >
                  Next →
                </button>
                <span className="text-xs font-bold text-brand-text ml-2 font-display">
                  {weekRangeLabel}
                </span>
              </div>

              {/* Weekly stats pill */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="px-2.5 py-1 rounded bg-brand-card border border-brand-border text-brand-muted">
                  Week Total: <strong className="text-brand-text">{weekStats.total}</strong>
                </span>
                <span className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 font-semibold flex items-center gap-1">
                  <span>🌟 Weekend Visits:</span>
                  <strong>{weekStats.weekend}</strong>
                </span>
              </div>
            </div>

            {/* 7-Day Columns Grid with horizontal scroll protection */}
            <div className="overflow-x-auto pb-2 -mx-1 px-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 items-start min-w-[950px] xl:min-w-0">
                {weekDays.map((day, idx) => {
                  const dayApps = getAppointmentsForDay(day);
                  const isDayToday = isToday(day);
                  const isWeekend = idx === 5 || idx === 6; // Saturday or Sunday
                  const dayName = day.toLocaleDateString([], { weekday: 'short' });
                  const dayNum = day.getDate();
                  const monthName = day.toLocaleDateString([], { month: 'short' });

                  return (
                    <div
                      key={day.toISOString()}
                      className={`rounded-xl border transition-all flex flex-col min-h-[320px] overflow-hidden ${isWeekend
                          ? 'border-amber-500/30 bg-amber-500/[0.02]'
                          : isDayToday
                            ? 'border-brand-accent/50 bg-brand-accent/[0.02] ring-1 ring-brand-accent/30'
                            : 'border-brand-border bg-brand-bg/40'
                        }`}
                    >
                      {/* Day Column Header */}
                      <div
                        className={`p-3 border-b flex items-center justify-between gap-1 ${isWeekend
                            ? 'border-amber-500/20 bg-amber-500/10'
                            : isDayToday
                              ? 'border-brand-accent/20 bg-brand-accent/10'
                              : 'border-brand-border/60 bg-brand-bg/60'
                          }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-bold uppercase tracking-wider ${isWeekend ? 'text-amber-700 font-black' : isDayToday ? 'text-brand-accent' : 'text-brand-text'
                              }`}>
                              {dayName}
                            </span>
                            {isDayToday && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-brand-accent text-primary-foreground uppercase">
                                Today
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-brand-muted mt-0.5">
                            {dayNum} {monthName}
                          </p>
                        </div>

                        <div className="text-right">
                          {isWeekend && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 border border-amber-500/30 block mb-0.5">
                              Weekend
                            </span>
                          )}
                          <span className={`text-[10px] font-body font-bold ${dayApps.length > 0 ? 'text-emerald-700' : 'text-brand-muted'
                            }`}>
                            {dayApps.length} {dayApps.length === 1 ? 'visit' : 'visits'}
                          </span>
                        </div>
                      </div>

                      {/* Day Column Content */}
                      <div className="p-2 space-y-2.5 flex-1">
                        {dayApps.length === 0 ? (
                          <div className="h-full min-h-[140px] flex flex-col items-center justify-center p-3 text-center border border-dashed border-brand-border/40 rounded-lg">
                            <span className="text-[11px] text-brand-muted/60 italic">No visits</span>
                          </div>
                        ) : (
                          dayApps.map(app => {
                            const appStart = new Date(app.startTime);
                            const appTime = appStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            return (
                              <div
                                key={app.id}
                                className="group relative rounded-xl border border-brand-border bg-brand-card p-3 space-y-2.5 shadow-sm hover:border-brand-accent/60 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-brand-accent/10 transition-all duration-300 ease-out cursor-pointer overflow-hidden"
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="px-2.5 py-0.5 rounded text-[11px] font-body font-bold bg-brand-accent/15 text-brand-accent border border-brand-accent/30 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-brand-accent text-primary-foreground animate-pulse shrink-0" />
                                    {appTime}
                                  </span>
                                  {app.status && app.status !== 'confirmed' && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-brand-muted/20 text-brand-muted border border-brand-border">
                                      {app.status}
                                    </span>
                                  )}
                                </div>

                                <div className="overflow-hidden">
                                  <h6 className="text-xs font-bold text-brand-text whitespace-nowrap animate-marquee-hover group-hover:text-brand-accent transition-colors" title={app.visitorName}>
                                    {app.visitorName}
                                  </h6>
                                  <p className="text-[11px] text-brand-muted font-body truncate mt-0.5">
                                    {app.visitorPhone}
                                  </p>
                                </div>

                                <div className="border-t border-brand-border/50 pt-1.5 overflow-hidden">
                                  <p className="text-[10px] text-brand-muted whitespace-nowrap animate-marquee-hover transition-transform" title={app.title}>
                                    📍 {app.title}
                                  </p>
                                </div>

                                <div className="pt-1">
                                  <WhatsAppButton
                                    lead={{
                                      name: app.visitorName,
                                      phone: app.visitorPhone,
                                      appointmentStatus: `${dayName}, ${dayNum} ${monthName} at ${appTime}`,
                                    }}
                                    size="sm"
                                    className="w-full justify-center group-hover:border-emerald-500/40"
                                  />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Classic List View */
          <div className="space-y-7">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-brand-text">Upcoming Site Visits</h4>
                <span className="text-[10px] font-body text-brand-muted">{grouped.upcoming.length} booking{grouped.upcoming.length === 1 ? '' : 's'}</span>
              </div>
              {grouped.upcoming.length ? (
                <div className="space-y-2">
                  {grouped.upcoming.map(appointment => <AppointmentCard key={appointment.id} appointment={appointment} />)}
                </div>
              ) : (
                <p className="text-xs text-brand-muted py-4">No upcoming appointments.</p>
              )}
            </div>
            {grouped.past.length > 0 && (
              <div className="pt-6 border-t border-brand-border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-brand-text">Past Site Visits</h4>
                  <span className="text-[10px] font-body text-brand-muted">Most recent first</span>
                </div>
                <div className="space-y-2 opacity-80">
                  {grouped.past.map(appointment => <AppointmentCard key={appointment.id} appointment={appointment} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

