import { Router } from 'express';
import { validateAccessRequest } from '@ai-receptionist/contracts';
import { config } from '../../config';
import { publicFormGuards } from '../../middleware/publicFormGuards';
import { emailTemplates, sendEmailSafely } from '../../services/email';
import { publishAdminEvent } from '../../services/adminEvents';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import { notifyAdmins as sendAdminAlert } from '../notifications';
import { authEmailExists, findOpenRequestByEmail, insertAccessRequest } from './repository';

const router = Router();

// Same answer whatever happened, so the form never reveals whether an email has a request or an
// account. The address owner gets the specific status by email instead.
const ACKNOWLEDGED = {
  ok: true,
  message: 'Thanks! We have received your request. Check your inbox for a confirmation email.',
};

async function notifyAdmins(request: { id: string; fullName: string; email: string; phone: string; businessName: string; industry: string }) {
  const content = emailTemplates.adminNewAccessRequest({
    name: request.fullName,
    email: request.email,
    phone: request.phone,
    businessName: request.businessName,
    industry: request.industry,
    consoleUrl: `${config.admin.origin}${config.admin.basePath}?request=${request.id}`,
  });
  await sendAdminAlert('access_requests', content, 'admin_new_access_request');
}

router.post(
  '/access-requests',
  ...publicFormGuards('access-request', { floodPer10Min: 20, perIpPerHour: 10, perEmailPerHour: 3 }),
  asyncRoute('AccessRequest', async (req, res) => {
    const result = validateAccessRequest(req.body);
    if ('errors' in result) {
      return res.status(400).json({ error: 'Please check the highlighted fields.', fields: result.errors });
    }
    const value = result.value;
    const signInUrl = `${config.clientUrl}/auth`;

    if (await authEmailExists(value.email)) {
      await sendEmailSafely(value.email, emailTemplates.accessRequestStatus({ name: value.fullName, status: 'account_exists', signInUrl }), 'access_request_status');
      return res.status(202).json(ACKNOWLEDGED);
    }

    const created = (await findOpenRequestByEmail(value.email))
      ? null
      : await insertAccessRequest(value, { ip: getClientIp(req), userAgent: req.get('user-agent') });

    if (!created) {
      await sendEmailSafely(value.email, emailTemplates.accessRequestStatus({ name: value.fullName, status: 'open', signInUrl }), 'access_request_status');
      return res.status(202).json(ACKNOWLEDGED);
    }

    await sendEmailSafely(value.email, emailTemplates.accessRequestReceived({ name: value.fullName }), 'access_request_received');
    publishAdminEvent({ type: 'access_request.created', id: created.id });
    // Admin emails must not slow down or fail the visitor's request.
    void notifyAdmins({ id: created.id, ...value }).catch(() => undefined);

    res.status(202).json(ACKNOWLEDGED);
  }),
);

export default router;
