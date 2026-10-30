import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Appointment } from '../types';
import { mapAppointment } from '../lib/appointments';

export function useAppointments(userSignedIn = false) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAppointments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, bot_id, session_id, lead_id, title, visitor_name, visitor_phone, start_time, end_time, status, created_at')
        .order('start_time', { ascending: true });

      if (error || !data) {
        setAppointments([]);
      } else {
        setAppointments(data.map(mapAppointment));
      }
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userSignedIn) {
      void fetchAppointments();
    }
  }, [userSignedIn, fetchAppointments]);

  return { appointments, fetchAppointments, loading, count: appointments.length };
}

