import { supabase } from './supabaseClient';

const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';

// Mirrors apps/api/src/modules/accounts/stage.ts.
export type AccountStage = 'not_provisioned' | 'suspended' | 'verify_email' | 'set_password' | 'onboarding' | 'active';

async function accountFetch<T>(path: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const response = await fetch(`${expressUrl}/api/account${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(response.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : data.error || 'Something went wrong. Please try again.');
  }
  return data as T;
}

export const accountApi = {
  state: () => accountFetch<{ stage: AccountStage; email?: string }>('/state'),
  setPassword: (password: string) => accountFetch<{ stage: AccountStage }>('/password', { password }),
  completeOnboarding: () => accountFetch<{ stage: AccountStage }>('/onboarding-complete', {}),
  sendVerificationEmail: () => accountFetch<{ stage: AccountStage; sent: boolean }>('/verification-email', {}),
};
