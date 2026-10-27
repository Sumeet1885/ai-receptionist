export const SUPPORT_DRAWER_EVENT = 'bolega:open-support';
export interface SupportDrawerRequest {
  view?: 'new' | 'tickets' | 'guest-ticket';
  ticketId?: string;
  token?: string;
}
export function openSupport(request: SupportDrawerRequest = {}) {
  window.dispatchEvent(new CustomEvent(SUPPORT_DRAWER_EVENT, { detail: request }));
}
