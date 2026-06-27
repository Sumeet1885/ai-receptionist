import { supabase } from './supabaseClient';

const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';

export interface CrmConnectionStatus {
  connected: boolean;
}

export interface CrmConnectPayload {
  webhookUrl: string;
  apiKey: string;
  signingSecret?: string;
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

export const crmApi = {
  getStatus: (botId: string) => authedFetch<CrmConnectionStatus>(`/api/crm/${botId}/status`),
  connect: (botId: string, payload: CrmConnectPayload) =>
    authedFetch<CrmConnectionStatus>(`/api/crm/${botId}/connect`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  disconnect: (botId: string) =>
    authedFetch<CrmConnectionStatus>(`/api/crm/${botId}/connect`, { method: 'DELETE' }),
};
