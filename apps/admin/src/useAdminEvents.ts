import { useEffect, useRef, useState } from 'react';

export type AdminEvent =
  | { type: 'access_request.created'; id: string }
  | { type: 'access_request.updated'; id: string; status: string }
  | { type: 'billing_order.updated'; id: string; status: string };

/**
 * Live connection to /api/admin/events (same origin, authenticated by the session cookie).
 * Reconnects with backoff; the server closes it when the session ends.
 */
export function useAdminEvents(onEvent: (event: AdminEvent) => void) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let attempts = 0;
    let stopped = false;

    const connect = () => {
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${scheme}://${window.location.host}/api/admin/events`);
      socket.onopen = () => {
        attempts = 0;
        setConnected(true);
      };
      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data);
          if (event?.type?.startsWith('access_request.') || event?.type?.startsWith('billing_order.')) onEventRef.current(event);
        } catch {
          // ignore malformed frames
        }
      };
      socket.onclose = (close) => {
        setConnected(false);
        // 4401: the session ended; reconnecting would only fail again.
        if (stopped || close.code === 4401) return;
        attempts += 1;
        retryTimer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5)));
      };
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  return connected;
}
