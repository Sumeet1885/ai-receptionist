import { useState, useCallback } from 'react';
import { Lead } from '../types';
import { supabase } from '../lib/supabaseClient';
import { LEAD_SELECT_FIELDS } from '../lib/leadQuery';

export function formatLeadDate(dateInput: string | Date | undefined): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const datePart = d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const timePart = d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
  return `${datePart} • ${timePart}`;
}

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);

  const fetchLeads = useCallback(async (botId?: string) => {
    let query = supabase
      .from('leads')
      .select(LEAD_SELECT_FIELDS)
      .order('updated_at', { ascending: false });
    if (botId) query = query.eq('bot_id', botId);
    const { data: rawLeads } = await query;
    if (!rawLeads || rawLeads.length === 0) {
      setLeads([]);
      return;
    }

    const sessionIds = rawLeads.map((l: any) => l.session_id).filter(Boolean);
    const outboundSessions = new Set<string>();
    const inboundSessions = new Set<string>();
    const webSessions = new Set<string>();
    const callMediaBySession = new Map<string, { recordingUrl?: string; durationSeconds?: number }>();

    if (sessionIds.length > 0) {
      try {
        // 1. Identify Outbound Campaign sessions from campaign_contacts
        const { data: campaigns } = await supabase
          .from('campaign_contacts')
          .select('session_id')
          .in('session_id', sessionIds);
        if (campaigns) {
          campaigns.forEach((c: any) => {
            if (c.session_id) outboundSessions.add(c.session_id);
          });
        }

        // 2. Identify Web Chat sessions
        const { data: sessions } = await supabase
          .from('chat_sessions')
          .select('id, channel')
          .in('id', sessionIds);
        if (sessions) {
          sessions.forEach((s: any) => {
            if (s.channel === 'web') webSessions.add(s.id);
          });
        }

        // 3. Get bot outbound workflow IDs to accurately distinguish outbound agents
        const { data: bots } = await supabase
          .from('bots')
          .select('id, dograh_outbound_workflow_id');
        const outboundWorkflowIds = new Set<string>();
        if (bots) {
          bots.forEach((b: any) => {
            if (b.dograh_outbound_workflow_id) {
              outboundWorkflowIds.add(String(b.dograh_outbound_workflow_id));
            }
          });
        }

        // 4. Query phone_calls with cost_info (direction), dograh_workflow_id, and audio recording info
        const { data: calls } = await supabase
          .from('phone_calls')
          .select('session_id, cost_info, dograh_workflow_id, recording_url, duration_seconds')
          .in('session_id', sessionIds);
        if (calls) {
          calls.forEach((call: any) => {
            if (!call.session_id) return;
            if (call.recording_url) {
              callMediaBySession.set(call.session_id, {
                recordingUrl: call.recording_url,
                durationSeconds: call.duration_seconds || undefined,
              });
            }
            const dir = call.cost_info?.direction;
            const wfId = call.dograh_workflow_id ? String(call.dograh_workflow_id) : '';
            const isOutbound =
              dir === 'outbound' ||
              outboundWorkflowIds.has(wfId) ||
              outboundSessions.has(call.session_id);

            if (isOutbound) {
              outboundSessions.add(call.session_id);
            } else {
              inboundSessions.add(call.session_id);
            }
          });
        }
      } catch (err) {
        console.warn('[useLeads] Channel detection query skipped:', err);
      }
    }

    const mapped: Lead[] = rawLeads.map((l: any) => {
      let channel: 'inbound' | 'outbound' | 'web' = 'inbound';
      const sId = l.session_id;

      if (sId && outboundSessions.has(sId)) {
        channel = 'outbound';
      } else if (sId && webSessions.has(sId)) {
        channel = 'web';
      } else if (sId && inboundSessions.has(sId)) {
        channel = 'inbound';
      } else {
        // Fallback heuristics based on metadata text
        const textToAnalyze = `${l.requirement || ''} ${l.summary || ''}`.toLowerCase();
        if (/outbound|campaign|telecaller|called customer/i.test(textToAnalyze)) {
          channel = 'outbound';
        } else if (l.phone && l.phone !== 'Not Provided') {
          channel = 'inbound';
        } else {
          channel = 'web';
        }
      }

      const media = sId ? callMediaBySession.get(sId) : undefined;

      return {
        id: l.id,
        botId: l.bot_id,
        sessionId: l.session_id,
        name: l.name,
        phone: l.phone,
        email: l.email,
        requirement: l.requirement,
        budget: l.budget,
        sentiment: l.sentiment,
        leadScore: l.lead_score,
        summary: l.summary,
        appointmentStatus: l.appointment_status,
        date: formatLeadDate(l.updated_at),
        channel,
        recordingUrl: media?.recordingUrl,
        durationSeconds: media?.durationSeconds,
      };
    });

    setLeads(mapped);
  }, []);

  return { leads, setLeads, fetchLeads };
}
