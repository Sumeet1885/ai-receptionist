import { EventEmitter } from 'node:events';

// In-process bus for realtime admin-console updates (the API runs as one container). Events carry
// ids and a status only; the console re-fetches details through the authorized REST routes.
export type AdminEvent =
  | { type: 'support.updated'; id: string }
  | { type: 'access_request.created'; id: string }
  | { type: 'access_request.updated'; id: string; status: string }
  | { type: 'billing_order.updated'; id: string; status: string };

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publishAdminEvent(event: AdminEvent) {
  bus.emit('event', event);
}

export function subscribeAdminEvents(listener: (event: AdminEvent) => void) {
  bus.on('event', listener);
  return () => {
    bus.off('event', listener);
  };
}
