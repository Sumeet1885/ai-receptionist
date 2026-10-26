export const LEAD_SELECT_FIELDS =
  'id,bot_id,name,phone,email,requirement,budget,sentiment,lead_score,summary,appointment_status,updated_at,session_id';

export function getLeadRefreshInterval(routeName: string): number | null {
  if (routeName === 'leads' || routeName === 'dashboard' || routeName === 'agent-detail') return 5000;
  return 10000;
}
