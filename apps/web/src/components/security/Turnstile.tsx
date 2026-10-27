import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || '';

let scriptPromise: Promise<void> | null = null;

function loadScript() {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Security check failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface TurnstileProps {
  onToken: (token: string | null) => void;
  // Change to get a fresh challenge (tokens are single-use, so after every failed submit).
  resetKey?: number;
}

/**
 * Cloudflare Turnstile widget. Without VITE_TURNSTILE_SITE_KEY it renders nothing; the API skips
 * the check only in development, so a missing key elsewhere makes the form fail visibly.
 */
export function Turnstile({ onToken, resetKey = 0 }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let widgetId: string | undefined;
    let cancelled = false;
    onTokenRef.current(null);

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={containerRef} className="min-h-[65px]" />;
}
