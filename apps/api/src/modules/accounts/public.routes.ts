import { Router } from 'express';
import { validateContactInput } from '@ai-receptionist/contracts';
import { config } from '../../config';
import { publicFormGuards, publicHeaders, publicOriginGuard } from '../../middleware/publicFormGuards';
import { createRateLimit } from '../../middleware/rateLimit';
import { logger } from '../../services/cloudwatchLogger';
import { emailTemplates, maskEmail, sendEmail } from '../../services/email';
import { asyncRoute } from '../../utils/asyncRoute';
import { authEmailExists, findLatestProvisionedRequestByEmail } from '../access-requests/repository';
import { findLatestProvisionedOrderByEmail } from '../billing/repository';
import { supabase } from '../../services/db';
import { createActivationLink, createRecoveryLink, createVerificationLink } from './links';
import { getCustomerAccount } from './repository';
import { issueRecoveryProof } from './recoveryProof';

// Public account emails, mounted at /api/public. Both answer identically whether or not the
// address has an account, so they cannot be used to find out who is a customer.

const router = Router();
router.post('/recovery-session', publicHeaders, publicOriginGuard,
  createRateLimit({ keyPrefix: 'recovery-session', limit: 10, windowMs: 60_000 }),
  asyncRoute('RecoverySession', async (req, res) => {
    const tokenHash = req.body?.tokenHash;
    if (typeof tokenHash !== 'string' || !/^[a-f0-9]{32,128}$/i.test(tokenHash)) return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' });
    // A separate REST call avoids signing the shared service-role client into a customer's session.
    const response = await fetch(`${config.supabaseUrl}/auth/v1/verify`, { method: 'POST',
      headers: { apikey: config.supabaseServiceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_hash: tokenHash, type: 'recovery' }), signal: AbortSignal.timeout(10_000) });
    const result = await response.json().catch(() => null);
    if (response.status === 429 || response.status >= 500) return res.status(503).json({ error: 'Could not verify the reset link right now. Please try again.' });
    if (!response.ok || !result?.user?.id || !result.access_token || !result.refresh_token) return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' });
    const recoveryProof = issueRecoveryProof(result.access_token, { id: result.user.id, updatedAt: result.user.updated_at }, config.supabaseServiceKey);
    res.json({ accessToken: result.access_token, refreshToken: result.refresh_token, recoveryProof });
  }));
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
  const reply = { ok: true, message: 'If this email has a workspace waiting to be activated or confirmed, a new link is on its way.' };

  try {
    // A workspace comes from an approved access request or a paid checkout.
    const source = (await findLatestProvisionedRequestByEmail(email)) ?? (await findLatestProvisionedOrderByEmail(email));
    const account = source?.provisioned_user_id ? await getCustomerAccount(source.provisioned_user_id) : null;
    if (source && account && account.status === 'active' && !account.password_set_at) {
      const link = await createActivationLink({
        email,
        userId: source.provisioned_user_id,
        fullName: source.full_name,
        businessName: source.business_name,
      });
      await sendEmail(
        email,
        emailTemplates.workspaceActivation({ name: source.full_name, activationUrl: link.url, expiresInHours: config.email.linkExpiryHours }),
        'workspace_activation',
      );
    } else if (source && account && account.status === 'active') {
      // Paid signups chose their password at checkout; they only need to confirm the email.
      const { data, error } = await supabase.auth.admin.getUserById(source.provisioned_user_id!);
      if (error) throw new Error(`load activation user: ${error.message}`);
      if (data?.user && !data.user.email_confirmed_at) {
        const link = await createVerificationLink(email);
        await sendEmail(
          email,
          emailTemplates.emailVerification({ verificationUrl: link.url, expiresInHours: config.email.linkExpiryHours }),
          'email_verification',
        );
      } else {
        logger.info('[ActivationResend] skipped; no email sent', { to: maskEmail(email), reason: data?.user ? 'already_activated' : 'login_not_found' });
      }
    } else {
      logger.info('[ActivationResend] skipped; no email sent', { to: maskEmail(email), reason: !source ? 'no_provisioned_workspace' : !account ? 'workspace_not_found' : 'workspace_inactive' });
    }
  } catch (error: any) {
    logger.error('[ActivationResend] failed', { to: maskEmail(email), error: error?.message });
  }
  res.status(202).json(reply);
}));

export default router;
