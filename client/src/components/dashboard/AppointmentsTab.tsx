import React, { useEffect, useState } from 'react';
import { Icons } from '../common/Icons';
import { supabase } from '../../lib/supabaseClient';

export const AppointmentsTab: React.FC = () => {
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const token = session.access_token;
        fetch(`${expressUrl}/api/calendar/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
          if (data.connected) {
            setCalendarConnected(true);
            setProvider(data.provider);
          }
        })
        .catch(console.error);
      }
    });
  }, []);

  const connectCalendar = async (targetProvider: 'google' | 'outlook') => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const token = session.access_token;
    try {
      const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';
      const res = await fetch(`${expressUrl}/api/calendar/auth-url?provider=${targetProvider}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url; // Redirect to OAuth consent
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm h-full flex flex-col">
      <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between bg-brand-bg/40">
        <h3 className="font-display font-bold text-brand-text text-lg flex items-center">
          <Icons.Calendar />
          <span className="ml-2">Calendar Integration</span>
        </h3>
        {calendarConnected && (
          <span className="px-2.5 py-1 bg-brand-success/10 border border-brand-success/30 text-brand-success text-[10px] font-bold rounded font-mono flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-success mr-1.5 animate-pulse"></span>
            Sync Active
          </span>
        )}
      </div>

      <div className="p-16 text-center space-y-6 flex-1">
        {calendarConnected ? (
          <div className="space-y-4 max-w-sm mx-auto">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-success/10 border border-brand-success/30 text-brand-success mb-2">
              <Icons.Check />
            </div>
            <h4 className="text-xl font-display font-bold text-brand-text">Calendar Connected</h4>
            <p className="text-sm font-sans text-brand-muted">
              Your AI Receptionist can now view your availability and schedule appointments automatically via {provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'}.
            </p>
            <div className="pt-4 p-4 border border-brand-border bg-brand-bg rounded-lg">
              <h5 className="text-xs font-bold font-mono text-brand-muted mb-2 text-left uppercase">Upcoming Bookings</h5>
              <div className="text-sm font-sans text-brand-muted py-4">
                No recent bookings. Check back soon!
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-bg border border-brand-border text-brand-muted mb-2">
              <Icons.Calendar />
            </div>
            <h4 className="text-xl font-display font-bold text-brand-text">Connect Your Calendar</h4>
            <p className="text-sm font-sans text-brand-muted max-w-md mx-auto">
              To let your AI Receptionist book appointments automatically, you need to connect your Google or Outlook calendar first.
            </p>
            
            <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
              <button 
                onClick={() => connectCalendar('google')}
                className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 font-sans font-semibold rounded-lg transition"
              >
                <Icons.Google />
                <span>Google Calendar</span>
              </button>
              
              <button 
                onClick={() => connectCalendar('outlook')}
                className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-[#00a4ef] hover:bg-[#0086c4] text-white border border-[#00a4ef] font-sans font-semibold rounded-lg transition"
              >
                <Icons.Microsoft />
                <span>Outlook Calendar</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
