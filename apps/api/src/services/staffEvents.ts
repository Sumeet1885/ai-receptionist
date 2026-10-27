import { EventEmitter } from 'node:events';

// In-process bus for realtime staff-console updates (the API runs as one container). Events carry
// ids and a status only; the console re-fetches details through the authorized REST routes.
export type StaffEvent =
  | { type: 'access_request.created'; id: string }
  | { type: 'access_request.updated'; id: string; status: string };

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publishStaffEvent(event: StaffEvent) {
  bus.emit('event', event);
}

export function subscribeStaffEvents(listener: (event: StaffEvent) => void) {
  bus.on('event', listener);
  return () => {
    bus.off('event', listener);
  };
}
