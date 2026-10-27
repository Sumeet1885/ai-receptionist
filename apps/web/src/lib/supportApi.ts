import type { SupportTicket } from '@ai-receptionist/contracts';
import { supabase } from './supabaseClient';

const base = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';
export async function supportRequest<T>(path: string, body?: unknown, guestToken?: string): Promise<T> {
  const guest = guestToken !== undefined;
  const headers: Record<string, string> = {};
  if (guestToken) headers['X-Support-Token'] = guestToken;
  if (!guest) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error('Please sign in to view your support tickets.');
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const multipart = body instanceof FormData;
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(`${base}/api/${guest ? 'public/support' : 'support'}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error('Could not reach support. Check your connection and try again.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error(result.error || 'Could not complete this support request.'), {
      fields: result.fields || {},
    });
  return result as T;
}
export const supportDetail = (id: string, guestToken?: string) =>
  supportRequest<{ ticket: SupportTicket }>(
    guestToken === undefined ? `/${id}` : '/ticket',
    undefined,
    guestToken,
  );
