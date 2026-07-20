import { supabase } from '../../lib/supabaseClient';

const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';

async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const response = await fetch(`${expressUrl}${path}`, {
    ...init,
    headers: {
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


export interface Campaign {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  total_contacts: number;
  called_count: number;
  hourly_cap_override: number | null;
  created_at: string;
  completed_at: string | null;
  isRunningLocally?: boolean;
}

export interface CampaignContact {
  id: string;
  phone_number: string;
  name: string | null;
  extra_data: Record<string, unknown> | null;
  call_status: 'pending' | 'calling' | 'done' | 'failed' | 'skipped';
  call_summary: string | null;
  lead_score: string | null;
  call_duration: number | null;
  error_message: string | null;
  called_at: string | null;
  row_index: number;
}

export interface UploadResult {
  campaignId: string;
  contactCount: number;
  skipped: number;
  preview: { name: string | null; phone_number: string; extra_data: Record<string, unknown> | null }[];
  detectedColumns: { phone: string; name: string | null };
}


export const campaignApi = {
  upload: async (
    botId: string,
    file: File,
    name: string,
    hourlyCap?: number,
  ): Promise<UploadResult> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in');

    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    if (hourlyCap) form.append('hourlyCap', String(hourlyCap));

    const response = await fetch(`${expressUrl}/api/campaigns/bots/${botId}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: form,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Upload failed (${response.status})`);
    }
    return response.json();
  },

  list: (botId: string) =>
    authedFetch<{ campaigns: Campaign[] }>(`/api/campaigns/bots/${botId}`),

  get: (campaignId: string) =>
    authedFetch<{ campaign: Campaign; contacts: CampaignContact[] }>(`/api/campaigns/${campaignId}`),

  start: (campaignId: string) =>
    authedFetch<{ success: boolean; status: string }>(`/api/campaigns/${campaignId}/start`, { method: 'POST' }),

  pause: (campaignId: string) =>
    authedFetch<{ success: boolean; status: string }>(`/api/campaigns/${campaignId}/pause`, { method: 'POST' }),

  delete: (campaignId: string) =>
    authedFetch<{ success: boolean }>(`/api/campaigns/${campaignId}`, { method: 'DELETE' }),

  export: async (campaignId: string, campaignName: string): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in');

    const response = await fetch(`${expressUrl}/api/campaigns/${campaignId}/export`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Export failed (${response.status})`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${campaignName.replace(/[^a-zA-Z0-9_-]/g, '_')}_summary.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};
