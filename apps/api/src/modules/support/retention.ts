import { supabase } from '../../services/db';
import { logger } from '../../services/cloudwatchLogger';
import { checked, supportSettings } from './repository';
import { deleteSupportObjects } from './storage';

let running = false;
export async function purgeSupportTickets() {
  if (running) return;
  running = true;
  try {
    const { retention_days } = await supportSettings();
    if (retention_days) {
      const cutoff = new Date(Date.now() - retention_days * 86400_000).toISOString();
      const count = checked(await supabase.rpc('purge_finished_support', { p_cutoff: cutoff }));
      if (count) logger.info('[support] retention batch finished', { count, retentionDays: retention_days });
    }
    const files = checked(await supabase.from('support_storage_cleanup').select('storage_key').limit(100));
    if (files.length) {
      await deleteSupportObjects(files.map((file) => file.storage_key));
      checked(
        await supabase
          .from('support_storage_cleanup')
          .delete()
          .in(
            'storage_key',
            files.map((file) => file.storage_key),
          ),
      );
    }
  } catch (error: any) {
    logger.error('[support] retention failed', { error: error?.message });
  } finally {
    running = false;
  }
}
export function startSupportRetention() {
  // Disabled by default. Super admins opt in by setting a retention period.
  const timer = setInterval(() => void purgeSupportTickets(), 60 * 60_000);
  timer.unref();
}
