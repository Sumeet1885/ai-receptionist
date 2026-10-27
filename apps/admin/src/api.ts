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

export const staffApi = {
  me: () => request<StaffSession>('/auth/me'),
  login: (email: string, password: string) =>
    request<StaffSession>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST', body: {} }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<StaffSession>('/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),
};
