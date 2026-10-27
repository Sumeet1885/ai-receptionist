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

export async function postPublic<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${expressUrl}/api/public${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(response.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : data.error || 'Something went wrong. Please try again.');
  }
  return data as T;
}
