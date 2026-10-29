import { supabase } from './supabaseClient';
import { createSessionRequest } from './sessionRecovery';
import type { CheckoutOrder, Currency } from './billingApi';
const sessionRequest = createSessionRequest(supabase.auth);
const base = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';
export interface WorkspaceMinutes {
  planId: string | null; planName: string | null; planSlug: string | null; currency: Currency;
  isTrial: boolean; startsAt: string | null; expiresAt: string | null; active: boolean;
  includedMinutes: number | null; topupMinutes: number; usedMinutes: number; remainingMinutes: number | null;
  topupOffer: { minutes: number; amount: number; currency: Currency } | null;
  topupOffers?: Record<Currency, { minutes: number; amount: number; currency: Currency } | null>;
}
export interface WorkspacePurchase {
  id: string; purchase_kind: 'initial' | 'renewal' | 'plan_change' | 'topup'; minutes_added: number | null;
  planName: string; currency: Currency; total: number; status: string; created_at: string;
  paid_at: string | null; razorpay_payment_id: string | null; target_period_end: string | null;
  payment_error: string | null;
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await sessionRequest(token => fetch(`${base}/api/workspace-billing${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not load billing. Please try again.');
  return data as T;
}
export const workspaceBillingApi = {
  summary: () => request<WorkspaceMinutes>('/summary'),
  history: (page: number) => request<{ rows: WorkspacePurchase[]; total: number; pageSize: number }>('/history?page=' + page),
  order: (body: { kind: 'topup'; quantity: number; currency: Currency } | { kind: 'plan_change'; plan: string; currency: Currency }) => request<CheckoutOrder>('/order', body),
};
