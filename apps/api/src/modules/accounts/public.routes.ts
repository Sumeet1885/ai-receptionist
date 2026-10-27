import { Router } from 'express';
import { validateContactInput } from '@ai-receptionist/contracts';
import { config } from '../../config';
import { publicFormGuards } from '../../middleware/publicFormGuards';
import { logger } from '../../services/cloudwatchLogger';
import { emailTemplates, maskEmail, sendEmail } from '../../services/email';
import { asyncRoute } from '../../utils/asyncRoute';
import { authEmailExists, findLatestProvisionedRequestByEmail } from '../access-requests/repository';
import { createActivationLink, createRecoveryLink } from './links';
import { getCustomerAccount } from './repository';

// Public account emails, mounted at /api/public. Both answer identically whether or not the
// address has an account, so they cannot be used to find out who is a customer.

const router = Router();
const guards = (name: string) => publicFormGuards(name, { floodPer10Min: 20, perIpPerHour: 10, perEmailPerHour: 3 });

function emailFrom(body: any) {
  const result = validateContactInput('email', typeof body?.email === 'string' ? body.email : '');
  return result.valid ? result.normalized : null;
}

router.post('/password-reset', ...guards('password-reset'), asyncRoute('PasswordReset', async (req, res) => {
  const email = emailFrom(req.body);
  if (!email) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const reply = { ok: true, message: 'If an account exists for this email, a password reset link is on its way.' };

  try {
    if (await authEmailExists(email)) {
      const link = await createRecoveryLink(email);
      const account = await getCustomerAccount(link.userId);
      if (account?.status === 'active') {
        await sendEmail(email, emailTemplates.passwordReset({ resetUrl: link.url, expiresInHours: config.email.linkExpiryHours }), 'password_reset');
      }
    }
  } catch (error: any) {
    // Same reply either way; the failure is for our logs only.
    logger.error('[PasswordReset] failed', { to: maskEmail(email), error: error?.message });
  }
  res.status(202).json(reply);
}));

router.post('/activation-resend', ...guards('activation-resend'), asyncRoute('ActivationResend', async (req, res) => {
  const email = emailFrom(req.body);
  if (!email) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const reply = { ok: true, message: 'If this email has a workspace waiting to be activated, a new activation link is on its way.' };

  try {
    const request = await findLatestProvisionedRequestByEmail(email);
    const account = request ? await getCustomerAccount(request.provisioned_user_id!) : null;
    if (request && account && account.status === 'active' && !account.password_set_at) {
      const link = await createActivationLink({
        email,
        userId: request.provisioned_user_id,
        fullName: request.full_name,
        businessName: request.business_name,
      });
      await sendEmail(
        email,
        emailTemplates.workspaceActivation({ name: request.full_name, activationUrl: link.url, expiresInHours: config.email.linkExpiryHours }),
        'workspace_activation',
      );
    }
  } catch (error: any) {
    logger.error('[ActivationResend] failed', { to: maskEmail(email), error: error?.message });
  }
  res.status(202).json(reply);
}));

export default router;
