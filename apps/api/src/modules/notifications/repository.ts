import type { NotificationEvent, NotificationRecipientColumns } from '@ai-receptionist/contracts';
import { supabase } from '../../services/db';

// The only place that queries admin_notification_recipients (service role).

export interface NotificationRecipientRow extends NotificationRecipientColumns {
  id: string;
  created_at: string;
  updated_at: string;
}

const EVENT_COLUMN: Record<NotificationEvent, keyof NotificationRecipientColumns> = {
  access_requests: 'notify_access_requests',
  payments: 'notify_payments',
  signup_leads: 'notify_signup_leads',
};

function check<T>(result: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (result.error) throw Object.assign(new Error(`${what}: ${result.error.message}`), { code: result.error.code });
  return result.data;
}

const COLUMNS = 'id,email,label,notify_access_requests,notify_payments,notify_signup_leads,is_active,created_at,updated_at';

export async function listRecipients() {
  return (check(await supabase.from('admin_notification_recipients').select(COLUMNS).order('created_at'), 'list notification recipients') ?? []) as NotificationRecipientRow[];
}

/** Active addresses for one kind of alert, or null when no recipients are configured at all. */
export async function recipientsFor(event: NotificationEvent): Promise<string[] | null> {
  const rows = await listRecipients();
  if (!rows.length) return null;
  return rows.filter((row) => row.is_active && row[EVENT_COLUMN[event]]).map((row) => row.email);
}

/** Null when the email is already on the list. */
export async function createRecipient(columns: NotificationRecipientColumns, createdBy: string) {
  const result = await supabase.from('admin_notification_recipients').insert({ ...columns, created_by: createdBy }).select(COLUMNS).single<NotificationRecipientRow>();
  if (result.error?.code === '23505') return null;
  return check(result, 'create notification recipient');
}

export async function updateRecipient(id: string, columns: NotificationRecipientColumns) {
  const result = await supabase
    .from('admin_notification_recipients')
    .update({ ...columns, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLUMNS)
    .maybeSingle<NotificationRecipientRow>();
  if (result.error?.code === '23505') throw Object.assign(new Error('email taken'), { code: '23505' });
  return check(result, 'update notification recipient');
}

export async function deleteRecipient(id: string) {
  return check(
    await supabase.from('admin_notification_recipients').delete().eq('id', id).select('id,email').maybeSingle<{ id: string; email: string }>(),
    'delete notification recipient',
  );
}
