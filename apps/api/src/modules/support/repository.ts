import { SALES_SUPPORT_CATEGORY, SUPPORT_CATEGORIES, type SupportCategory } from '@ai-receptionist/contracts';
import { supabase } from '../../services/db';

export function checked<T>(result: { data: T; error: any }): T {
  if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
  return result.data;
}
export async function supportSettings(): Promise<{ categories: SupportCategory[]; retention_days: number }> {
  try {
    const { data: row, error } = await supabase.from('support_settings').select('categories,retention_days').eq('id', true).maybeSingle();
    if (error || !row) {
      return { categories: [...SUPPORT_CATEGORIES], retention_days: 0 };
    }
    return {
      categories: [
        ...(row.categories.length ? row.categories : SUPPORT_CATEGORIES).filter(
          (category: any) => category.id !== SALES_SUPPORT_CATEGORY.id,
        ),
        SALES_SUPPORT_CATEGORY,
      ],
      retention_days: row.retention_days || 0,
    };
  } catch {
    return { categories: [...SUPPORT_CATEGORIES], retention_days: 0 };
  }
}
export async function supportTicket(id: string) {
  return checked(await supabase.from('support_tickets').select('*').eq('id', id).maybeSingle());
}
export async function supportDetail(ticket: any, admin: boolean) {
  let query = supabase
    .from('support_messages')
    .select('*,attachments:support_attachments(id,file_name,file_size,content_type)')
    .eq('ticket_id', ticket.id)
    .order('created_at');
  if (!admin) query = query.eq('is_internal', false);
  return { ...ticket, messages: checked(await query) };
}
