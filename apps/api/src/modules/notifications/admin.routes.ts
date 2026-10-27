import { Router, type Response } from 'express';
import { validateNotificationRecipient } from '@ai-receptionist/contracts';
import { config } from '../../config';
import { emailTemplates, sendEmailSafely } from '../../services/email';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import { adminOriginGuard, noStore, requireAdminRole, requireAdminSession, type AdminRequest } from '../admin-auth/middleware';
import { listActiveSuperAdminEmails, recordAudit } from '../admin-auth/repository';
import { createRecipient, deleteRecipient, listRecipients, updateRecipient } from './repository';

// Alert email recipients, mounted at /api/admin/notifications. Anyone signed in may look;
// only super_admin changes the list, and every change is audited.

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const handle = (fn: (req: AdminRequest, res: Response) => Promise<unknown>) => asyncRoute<AdminRequest>('Notifications', fn);

router.use(noStore);
router.use(adminOriginGuard(config.admin.origins));
router.use(requireAdminSession);

function audit(req: AdminRequest, action: string, resourceId: string, metadata: Record<string, unknown>) {
  return recordAudit({
    action,
    decision: 'allowed',
    outcome: 'succeeded',
    actor_admin_user_id: req.admin!.adminUser.id,
    actor_session_id: req.admin!.sessionId,
    resource_type: 'notification_recipient',
    resource_id: resourceId,
    ip: getClientIp(req),
    metadata,
  });
}

router.get('/recipients', requireAdminRole('read_only'), handle(async (_req, res) => {
  const recipients = await listRecipients();
  // While the list is empty, alerts go to the super admins; show who that is.
  res.json({ recipients, fallback: recipients.length ? [] : await listActiveSuperAdminEmails() });
}));

router.post('/recipients', requireAdminRole('super_admin'), handle(async (req, res) => {
  const parsed = validateNotificationRecipient(req.body);
  if ('errors' in parsed) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: parsed.errors });
  const recipient = await createRecipient(parsed.value, req.admin!.adminUser.id);
  if (!recipient) return res.status(409).json({ error: 'This email is already on the list.', fields: { email: 'Already on the list.' } });
  await audit(req, 'notification_recipient.create', recipient.id, { email: recipient.email });
  res.status(201).json({ recipient });
}));

router.put('/recipients/:id', requireAdminRole('super_admin'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Recipient not found' });
  const parsed = validateNotificationRecipient(req.body);
  if ('errors' in parsed) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: parsed.errors });
  try {
    const recipient = await updateRecipient(req.params.id, parsed.value);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
    await audit(req, 'notification_recipient.update', recipient.id, {
      email: recipient.email,
      active: recipient.is_active,
      accessRequests: recipient.notify_access_requests,
      payments: recipient.notify_payments,
      signupLeads: recipient.notify_signup_leads,
    });
    res.json({ recipient });
  } catch (error: any) {
    if (error.code === '23505') return res.status(409).json({ error: 'This email is already on the list.', fields: { email: 'Already on the list.' } });
    throw error;
  }
}));

router.delete('/recipients/:id', requireAdminRole('super_admin'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Recipient not found' });
  const removed = await deleteRecipient(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Recipient not found' });
  await audit(req, 'notification_recipient.delete', removed.id, { email: removed.email });
  res.json({ ok: true });
}));

// Sends a sample alert to one recipient, so a new address can be checked straight away.
router.post('/recipients/:id/test', requireAdminRole('super_admin'), handle(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Recipient not found' });
  const recipient = (await listRecipients()).find((row) => row.id === req.params.id);
  if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
  const result = await sendEmailSafely(recipient.email, emailTemplates.adminTestAlert({ consoleUrl: `${config.admin.origin}${config.admin.basePath}notifications` }), 'admin_test_alert');
  await audit(req, 'notification_recipient.test', recipient.id, { email: recipient.email, delivered: result.delivered });
  res.json({ delivered: result.delivered });
}));

export default router;
