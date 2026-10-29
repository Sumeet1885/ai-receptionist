import { Router, type Response } from 'express';
import { config } from '../../config';
import { requireAuth, type AuthRequest } from '../../middleware/auth';
import { createRateLimit } from '../../middleware/rateLimit';
import { logger } from '../../services/cloudwatchLogger';
import { supabase } from '../../services/db';
import { emailTemplates, maskEmail, sendEmail, sendEmailSafely } from '../../services/email';
import { asyncRoute } from '../../utils/asyncRoute';
import { createVerificationLink } from './links';
import { getCustomerAccount, markCustomerAccount } from './repository';
import { checkCustomerPassword, computeAccountStage } from './stage';
import { validRecoveryProof } from './recoveryProof';

// Signed-in customer's own lifecycle, mounted at /api/account.

const router = Router();
const handle = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => asyncRoute<AuthRequest>('Account', fn);
const perUser = (keyPrefix: string, limit: number, windowMs: number) =>
  createRateLimit({ keyPrefix, limit, windowMs }, (req) => (req as AuthRequest).user?.id ?? null);

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
router.use(requireAuth);

async function stageFor(req: AuthRequest) {
  const account = await getCustomerAccount(req.user!.id);
  return { account, stage: computeAccountStage(account, Boolean(req.user!.emailConfirmedAt)) };
}

router.get('/state', handle(async (req, res) => {
  const { stage, account } = await stageFor(req);
  res.json({ stage, email: req.user!.email, accessExpiresAt: account?.access_expires_at ?? null, trialEndsAt: account?.trial_ends_at ?? null, accessStartsAt: account?.plan_started_at ?? account?.access_starts_at ?? null });
}));

router.post('/change-password', perUser('account-change-password', 5, 15 * 60_000), handle(async (req, res) => {
  const { account, stage } = await stageFor(req);
  if (!account || account.status !== 'active' || !req.user!.emailConfirmedAt || !account.password_set_at || !req.user!.email) return res.status(403).json({ error: 'Activate your account before changing your password.' });
  const currentPassword = req.body?.currentPassword;
  const password = req.body?.password;
  if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128) return res.status(400).json({ error: 'Enter your current password.' });
  const problem = checkCustomerPassword(password, req.user!.email);
  if (problem) return res.status(400).json({ error: problem });
  if (password === currentPassword) return res.status(400).json({ error: 'Choose a password different from your current password.' });
  // Reauthenticate without modifying the service-role client's session or trusting a submitted email.
  let verified: Awaited<ReturnType<typeof fetch>>;
  try {
    verified = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: config.supabaseServiceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: req.user!.email, password: currentPassword }), signal: AbortSignal.timeout(10_000),
    });
  } catch { return res.status(503).json({ error: 'Could not verify your current password. Please try again.' }); }
  if (verified.status === 429 || verified.status >= 500) return res.status(503).json({ error: 'Password verification is temporarily unavailable. Please try again later.' });
  const result = await verified.json().catch(() => null);
  if (!verified.ok || result?.user?.id !== req.user!.id) return res.status(400).json({ error: 'Your current password is incorrect.' });
  const { error } = await supabase.auth.admin.updateUserById(req.user!.id, { password });
  if (error) return res.status(400).json({ error: 'That password was not accepted. Try a longer or less common password.' });
  void sendEmailSafely(req.user!.email, emailTemplates.passwordChanged({ email: req.user!.email, when: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST', resetUrl: `${config.clientUrl}/auth?mode=forgot` }), 'password_changed');
  res.json({ stage });
}));

// Sets the password during activation and for resets (the recovery link signs the person in).
router.post('/password', perUser('account-password', 10, 15 * 60_000), handle(async (req, res) => {
  const { account, stage } = await stageFor(req);
  if (account?.password_set_at && !validRecoveryProof(req.body?.recoveryProof, req.headers.authorization?.slice(7) || '', req.user!, config.supabaseServiceKey)) {
    return res.status(403).json({ error: 'Use Change password with your current password, or request a fresh password reset link.' });
  }
  if (!['set_password', 'onboarding', 'active', 'scheduled'].includes(stage)) {
    return res.status(403).json({ error: 'Confirm your email before choosing a password.', stage });
  }

  const policyError = checkCustomerPassword(req.body?.password, req.user!.email);
  if (policyError) return res.status(400).json({ error: policyError });

  const { error } = await supabase.auth.admin.updateUserById(req.user!.id, { password: req.body.password });
  if (error) {
    logger.warn('[Account] password update rejected', { error: error.message });
    return res.status(400).json({ error: 'That password was not accepted. Try a longer or less common one.' });
  }
  if (!account!.password_set_at) await markCustomerAccount(req.user!.id, { password_set_at: new Date().toISOString() });
  // A change or reset (not the first password at activation) gets a security notice.
  else if (req.user!.email) {
    void sendEmailSafely(req.user!.email, emailTemplates.passwordChanged({
      email: req.user!.email,
      when: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST',
      resetUrl: `${config.clientUrl}/auth?mode=forgot`,
    }), 'password_changed');
  }

  const next = await stageFor(req);
  res.json({ stage: next.stage });
}));

router.post('/onboarding-complete', handle(async (req, res) => {
  const { stage } = await stageFor(req);
  if (stage === 'onboarding') {
    await markCustomerAccount(req.user!.id, { onboarding_completed_at: new Date().toISOString() });
    if (req.user!.email) {
      void sendEmailSafely(req.user!.email, emailTemplates.onboardingComplete({
        name: req.user!.name || 'there',
        dashboardUrl: `${config.clientUrl}/dashboard`,
      }), 'onboarding_complete');
    }
    return res.json({ stage: 'active' });
  }
  res.json({ stage });
}));

router.post('/verification-email', perUser('account-verify', 3, 60 * 60_000), handle(async (req, res) => {
  const { stage } = await stageFor(req);
  if (stage !== 'verify_email' || !req.user!.email) return res.json({ stage, sent: false });

  const link = await createVerificationLink(req.user!.email);
  await sendEmail(
    req.user!.email,
    emailTemplates.emailVerification({ verificationUrl: link.url, expiresInHours: config.email.linkExpiryHours }),
    'email_verification',
  );
  logger.info('[Account] verification email sent', { to: maskEmail(req.user!.email) });
  res.json({ stage, sent: true });
}));

export default router;
