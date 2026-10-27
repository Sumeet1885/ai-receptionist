export interface StaffSession {
  principal: {
    id: string;
    email: string;
    displayName: string;
    mustChangePassword: boolean;
  };
  roles: string[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// The session lives in an httpOnly cookie; nothing auth-related is kept in browser storage.
async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error || 'Request failed');
  return data as T;
}

export type AccessRequestStatus = 'pending' | 'contacted' | 'approved' | 'rejected';

export interface AccessRequestSummary {
  id: string;
  status: AccessRequestStatus;
  full_name: string;
  email: string;
  phone: string;
  business_name: string;
  industry: string;
  city: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface AccessRequestDetail extends AccessRequestSummary {
  website: string | null;
  monthly_volume: string | null;
  languages: string[];
  use_case: string | null;
  ip: string | null;
  user_agent: string | null;
  staff_notes: string | null;
  rejection_reason: string | null;
  provisioned_user_id: string | null;
  provisioned_at: string | null;
  activation_sent_at: string | null;
  activation_send_count: number;
  updated_at: string;
}

export interface AccessRequestList {
  rows: AccessRequestSummary[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<AccessRequestStatus, number>;
}

export interface AccessRequestAccount {
  status: 'active' | 'suspended';
  activated: boolean;
  onboardingCompleted: boolean;
}

export const accessRequestApi = {
  list: (params: { status?: AccessRequestStatus; search?: string; page?: number }) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.page) query.set('page', String(params.page));
    return request<AccessRequestList>(`/access-requests?${query.toString()}`);
  },
  get: (id: string) =>
    request<{ request: AccessRequestDetail; account: AccessRequestAccount | null }>(`/access-requests/${encodeURIComponent(id)}`),
  markContacted: (id: string) =>
    request<{ request: AccessRequestDetail }>(`/access-requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'contacted' } }),
  saveNotes: (id: string, staffNotes: string) =>
    request<{ request: AccessRequestDetail }>(`/access-requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: { staffNotes } }),
  reject: (id: string, reason: string, notify: boolean) =>
    request<{ request: AccessRequestDetail }>(`/access-requests/${encodeURIComponent(id)}/reject`, { method: 'POST', body: { reason, notify } }),
  approve: (id: string) =>
    request<{ request: AccessRequestDetail }>(`/access-requests/${encodeURIComponent(id)}/approve`, { method: 'POST', body: {} }),
  resendActivation: (id: string) =>
    request<{ request: AccessRequestDetail }>(`/access-requests/${encodeURIComponent(id)}/resend-activation`, { method: 'POST', body: {} }),
};

export const staffApi = {
  me: () => request<StaffSession>('/auth/me'),
  login: (email: string, password: string) =>
    request<StaffSession>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST', body: {} }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<StaffSession>('/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),
};
