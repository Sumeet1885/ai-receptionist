import { supabase } from './supabaseClient';
import { createSessionRequest } from './sessionRecovery';

const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';
const sessionRequest = createSessionRequest(supabase.auth);

// Mirrors apps/api/src/modules/accounts/stage.ts.
export type AccountStage = 'not_provisioned' | 'suspended' | 'verify_email' | 'set_password' | 'onboarding' | 'active' | 'payment_required' | 'scheduled';

async function accountFetch<T>(path: string, body?: unknown): Promise<T> {
  const response = await sessionRequest(async token => {
    try {
      return await fetch(`${expressUrl}/api/account${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new Error('The workspace server took too long to respond. Please try again.');
      throw new Error('Cannot connect to the workspace server. Check your connection and try again.');
    }
    });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 401 ? 'Your session could not be verified. Sign out and sign in again.' : response.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : data.error || 'The workspace server could not load your account. Please try again.';
    throw new Error(data.reference ? `${message} (Reference ${data.reference})` : message);
  }
  return data as T;
}

export const accountApi = {
  changePassword: (currentPassword: string, password: string) => accountFetch<{ stage: AccountStage }>('/change-password', { currentPassword, password }),
  state: () => accountFetch<{ stage: AccountStage; email?: string; accessStartsAt?: string | null; accessExpiresAt?: string | null; trialEndsAt?: string | null }>('/state'),
  setPassword: (password: string) => accountFetch<{ stage: AccountStage }>('/password', { password }),
  completeOnboarding: () => accountFetch<{ stage: AccountStage }>('/onboarding-complete', {}),
  sendVerificationEmail: () => accountFetch<{ stage: AccountStage; sent: boolean }>('/verification-email', {}),
};
