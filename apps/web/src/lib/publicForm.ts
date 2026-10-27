import { useCallback, useRef, useState } from 'react';
import { FORM_ELAPSED_FIELD, HONEYPOT_FIELD, TURNSTILE_TOKEN_FIELD } from '@ai-receptionist/contracts';
import { TURNSTILE_SITE_KEY } from '../components/security/Turnstile';

const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';

/**
 * State for one public form's bot protection: the honeypot value, the browser-measured fill time
 * and the Turnstile token. `guardFields()` returns the extra body fields the API guards expect.
 */
export function usePublicFormGuard() {
  const startedAt = useRef(Date.now());
  const [honeypot, setHoneypot] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const guardFields = useCallback(() => ({
    [HONEYPOT_FIELD]: honeypot,
    [FORM_ELAPSED_FIELD]: Date.now() - startedAt.current,
    [TURNSTILE_TOKEN_FIELD]: token ?? '',
  }), [honeypot, token]);

  // Turnstile tokens are single-use: get a new challenge after every submit attempt.
  const resetChallenge = useCallback(() => setResetKey((key) => key + 1), []);

  return {
    honeypotProps: {
      name: HONEYPOT_FIELD,
      value: honeypot,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => setHoneypot(event.target.value),
    },
    turnstileProps: { onToken: setToken, resetKey },
    captchaReady: !TURNSTILE_SITE_KEY || Boolean(token),
    guardFields,
    resetChallenge,
  };
}

const TIMEOUT_MS = 20_000;

/**
 * One request to /api/public with the failures people actually hit turned into clear messages:
 * no connection, a slow server, rate limits, and server errors (with the log reference).
 * Returns the parsed body for successful and validation (4xx) answers alike.
 */
export async function publicRequest(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any; message: string }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${expressUrl}/api/public${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new Error(controller.signal.aborted
      ? 'This is taking too long. Check your connection and try again.'
      : 'We could not reach our servers. Check your internet connection and try again.');
  } finally {
    window.clearTimeout(timer);
  }
  // Some proxy errors are HTML; never show a parse error.
  const data = await response.json().catch(() => ({}));
  let message = '';
  if (!response.ok) {
    if (response.status === 429) message = 'Too many attempts. Please wait a few minutes and try again.';
    else if (data.error) message = data.reference ? `${data.error} (Reference ${data.reference})` : data.error;
    else if (response.status >= 500) message = 'Our service is having trouble right now. Please try again in a few minutes.';
    else message = 'Something went wrong. Please try again.';
  }
  return { ok: response.ok, status: response.status, data, message };
}

export async function postPublic<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const result = await publicRequest(path, body);
  if (!result.ok) throw new Error(result.message);
  return result.data as T;
}
