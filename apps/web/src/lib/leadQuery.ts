export const LEAD_SELECT_FIELDS =
  'id,bot_id,name,phone,email,requirement,budget,sentiment,lead_score,summary,appointment_status,updated_at,session_id';

export function getLeadRefreshInterval(routeName: string): number | null {
  if (routeName === 'leads' || routeName === 'agent-detail') return 15000;
  if (routeName === 'dashboard') return 60000;
  return null;
}
