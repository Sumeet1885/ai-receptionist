import type { NotificationEvent } from '@ai-receptionist/contracts';
import { logger } from '../../services/cloudwatchLogger';
import { sendEmailSafely } from '../../services/email';
import type { EmailContent } from '../../services/email/templates';
import { listActiveSuperAdminEmails } from '../admin-auth/repository';
import { recipientsFor } from './repository';

/**
 * Emails an admin alert to everyone subscribed to that kind of alert in the console. Until the
 * list has been set up, every active super_admin gets it, so nothing is missed. Never throws.
 */
export async function notifyAdmins(event: NotificationEvent, content: EmailContent, tag: string) {
  try {
    const recipients = (await recipientsFor(event)) ?? (await listActiveSuperAdminEmails());
    for (const to of recipients) await sendEmailSafely(to, content, tag);
  } catch (error: any) {
    logger.error('[Notifications] alert not sent', { event, error: error?.message });
  }
}
