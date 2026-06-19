export const LEAD_SELECT_FIELDS =
  'id,bot_id,name,phone,requirement,budget,sentiment,lead_score,summary,appointment_status,updated_at';

export function getLeadRefreshInterval(routeName: string): number | null {
  if (routeName === 'leads') return 15000;
  if (routeName === 'dashboard') return 60000;
  return null;
}
