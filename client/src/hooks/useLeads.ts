import { useState, useCallback } from 'react';
import { Lead } from '../types';
import { supabase } from '../lib/supabaseClient';

function mapLeadFromDb(l: any): Lead {
  return {
    id: l.id,
    botId: l.bot_id,
    name: l.name,
    phone: l.phone,
    requirement: l.requirement,
    budget: l.budget,
    sentiment: l.sentiment,
    leadScore: l.lead_score,
    summary: l.summary,
    appointmentStatus: l.appointment_status,
    date: new Date(l.updated_at).toLocaleString()
  };
}

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);

  const fetchLeads = useCallback(async (botId?: string) => {
    let query = supabase.from('leads').select('*').order('updated_at', { ascending: false });
    if (botId) query = query.eq('bot_id', botId);
    const { data } = await query;
    if (data) setLeads(data.map(mapLeadFromDb));
  }, []);

  return { leads, setLeads, fetchLeads };
}
