import { supabase } from '../../lib/supabaseClient';

const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';

export interface TelephonyCredentials {
  accountSid?: string;
  authToken?: string;
  authId?: string;
  appId?: string;
  apiKey?: string;
  apiSecret?: string;
  connectionId?: string;
  hasSecret?: boolean;
  // Asterisk ARI
  ariEndpoint?: string;
  appName?: string;
  appPassword?: string;
  wsClientName?: string;
  dialStringTemplate?: string;
  stasisAppName?: string;
  isDefaultOutbound?: boolean;
}

export interface TelephonyConfigInfo {
  provider: 'twilio' | 'plivo' | 'vonage' | 'telnyx' | 'forwarding' | 'asterisk' | 'pool' | 'custom';
  phoneNumber: string;
  label?: string | null;
  credentials?: TelephonyCredentials;
  configuredAt?: string;
  status?: string;
}

export interface ConnectedPhoneLine {
  id: string;
  phoneNumber: string;
  type: 'inbound' | 'outbound' | 'both' | 'forwarding';
  provider: 'twilio' | 'plivo' | 'vonage' | 'telnyx' | 'forwarding' | 'asterisk' | 'pool' | 'custom';
  label?: string | null;
  status: 'active' | 'inactive';
  isPrimaryInbound?: boolean;
  isPrimaryOutbound?: boolean;
  configuredAt: string;
  telephonyConfigId?: string | number | null;
  phoneNumberId?: string | number | null;
}

export interface PhoneAgentStatus {
  provisioned: boolean;
  outboundProvisioned: boolean;
  phoneNumber: string | null;
  outboundPhoneNumber?: string | null;
  inboundActiveWorkflow?: 'normal' | 'capacity' | string | null;
  inboundRateLimitedUntil?: string | null;
  outboundCooldownSeconds: number;
  outboundHourlyCap: number;
  inboundCooldownSeconds: number;
  inboundHourlyCap: number;
  telephony?: TelephonyConfigInfo | null;
  outboundTelephony?: TelephonyConfigInfo | null;
  connectedLines?: ConnectedPhoneLine[];
  inboundWebhookUrl?: string;
  defaultPlatformNumber?: string;
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
  direction?: 'inbound' | 'outbound';
  duration_seconds: number | null;
  recording_url: string | null;
  transcript_url: string | null;
  started_at: string | null;
  created_at: string;
  ingest_status: 'pending' | 'done' | 'failed';
  lead: { name: string; lead_score: string; summary: string; appointment_status: string } | null;
}

export interface AssignNumberPayload {
  provider?: 'twilio' | 'plivo' | 'vonage' | 'telnyx' | 'forwarding' | 'asterisk' | 'pool' | 'custom';
  customPhoneNumber?: string;
  telephonyConfigId?: number;
  phoneNumberId?: number;
  credentials?: TelephonyCredentials & {
    label?: string;
  };
  label?: string;
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
  assignNumber: (
    botId: string,
    payload: AssignNumberPayload | number,
    maybePhoneNumberId?: number
  ) => {
    const body =
      typeof payload === 'number'
        ? { telephonyConfigId: payload, phoneNumberId: maybePhoneNumberId, provider: 'pool' }
        : payload;
    return authedFetch<{ phoneNumber: string; provider?: string; status?: string; inboundWebhookUrl?: string; stasisAppName?: string; telephonyConfigId?: number }>(
      `/api/dograh/bots/${botId}/assign-number`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  },
  assignOutboundNumber: (
    botId: string,
    payload: {
      mode: 'same_as_inbound' | 'platform_default' | 'byot';
      provider?: string;
      customPhoneNumber?: string;
      telephonyConfigId?: number;
      phoneNumberId?: number;
      credentials?: TelephonyCredentials;
      label?: string;
    }
  ) =>
    authedFetch<{
      success: boolean;
      phoneNumber?: string | null;
      outboundTelephony?: TelephonyConfigInfo | null;
      mode?: string;
    }>(`/api/dograh/bots/${botId}/assign-outbound-number`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  unassignNumber: (botId: string) =>
    authedFetch<{ success: boolean }>(`/api/dograh/bots/${botId}/unassign-number`, {
      method: 'POST',
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
  addPhoneLine: (
    botId: string,
    payload: {
      phoneNumber: string;
      type: 'inbound' | 'outbound' | 'both' | 'forwarding';
      provider?: string;
      label?: string;
      credentials?: TelephonyCredentials;
    }
  ) =>
    authedFetch<{ success: boolean; connectedLines: ConnectedPhoneLine[] }>(
      `/api/dograh/bots/${botId}/lines`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  removePhoneLine: (botId: string, lineId: string) =>
    authedFetch<{ success: boolean; connectedLines: ConnectedPhoneLine[] }>(
      `/api/dograh/bots/${botId}/lines/${lineId}`,
      { method: 'DELETE' }
    ),
  setPrimaryLine: (botId: string, lineId: string, role: 'inbound' | 'outbound') =>
    authedFetch<{ success: boolean; connectedLines: ConnectedPhoneLine[] }>(
      `/api/dograh/bots/${botId}/lines/${lineId}/primary`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }
    ),
};
