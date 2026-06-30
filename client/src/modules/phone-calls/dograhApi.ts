import { supabase } from '../../lib/supabaseClient';

const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';

export interface PhoneAgentStatus {
  provisioned: boolean;
  outboundProvisioned: boolean;
  phoneNumber: string | null;
  outboundCooldownSeconds: number;
  outboundHourlyCap: number;
  inboundCooldownSeconds: number;
  inboundHourlyCap: number;
}

export interface DograhNumber {
  telephonyConfigId: number;
  telephonyConfigName: string;
  phoneNumberId: number;
  address: string;
  label: string | null;
  isAssignedToThisBot: boolean;
}

export interface PhoneCallRecord {
  id: string;
  session_id: string | null;
  caller_number: string | null;
  status: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript_url: string | null;
  started_at: string | null;
  created_at: string;
  ingest_status: 'pending' | 'done' | 'failed';
  lead: { name: string; lead_score: string; summary: string; appointment_status: string } | null;
}

async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const response = await fetch(`${expressUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request to ${path} failed (${response.status})`);
  }
  return response.json();
}

export const dograhApi = {
  getStatus: (botId: string) => authedFetch<PhoneAgentStatus>(`/api/dograh/bots/${botId}/status`),
  provision: (botId: string) => authedFetch<{ dograhWorkflowId: string }>(`/api/dograh/bots/${botId}/provision`, { method: 'POST' }),
  listNumbers: (botId: string) => authedFetch<{ numbers: DograhNumber[] }>(`/api/dograh/numbers?botId=${botId}`),
  assignNumber: (botId: string, telephonyConfigId: number, phoneNumberId: number) =>
    authedFetch<{ phoneNumber: string }>(`/api/dograh/bots/${botId}/assign-number`, {
      method: 'POST',
      body: JSON.stringify({ telephonyConfigId, phoneNumberId }),
    }),
  callOut: (botId: string, phoneNumber: string) =>
    authedFetch<{ success: boolean }>(`/api/dograh/bots/${botId}/call`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),
  updateOutboundRateLimit: (botId: string, cooldownSeconds: number, hourlyCap: number) =>
    authedFetch<{ outboundCooldownSeconds: number; outboundHourlyCap: number }>(`/api/dograh/bots/${botId}/outbound-rate-limit`, {
      method: 'PUT',
      body: JSON.stringify({ cooldownSeconds, hourlyCap }),
    }),
  updateInboundRateLimit: (botId: string, cooldownSeconds: number, hourlyCap: number) =>
    authedFetch<{ inboundCooldownSeconds: number; inboundHourlyCap: number }>(`/api/dograh/bots/${botId}/inbound-rate-limit`, {
      method: 'PUT',
      body: JSON.stringify({ cooldownSeconds, hourlyCap }),
    }),
  listCalls: (botId: string) => authedFetch<{ calls: PhoneCallRecord[] }>(`/api/dograh/bots/${botId}/calls`),
  syncNow: (botId: string) => authedFetch<{ ingested: number; failed: number }>(`/api/dograh/bots/${botId}/sync`, { method: 'POST' }),
};
