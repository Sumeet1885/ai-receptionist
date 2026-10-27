import { Router, type Response } from 'express';
import { config } from '../../config';
import { createRateLimit } from '../../middleware/rateLimit';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import { adminOriginGuard, noStore, requireAdminSession, type AdminRequest } from './middleware';
import { checkPasswordPolicy, getDummyHash, hashPassword, verifyPassword } from './password';
import {
  createSession,
  findAdminUserByEmail,
  findAdminUserById,
  getActiveRoles,
  recordAudit,
  recordLoginFailure,
  recordLoginSuccess,
  revokeOtherSessions,
  revokeSession,
  setPassword,
  type AdminUser,
} from './repository';
import {
  hashSessionToken,
  newSessionToken,
  sessionCookieName,
  sessionCookieOptions,
  SESSION_ABSOLUTE_MS,
  type AdminRole,
} from './session';

const router = Router();

const INVALID_CREDENTIALS = { error: 'Invalid email or password' };
const cookieName = sessionCookieName(config.environment);
const cookieOptions = sessionCookieOptions(config.environment);

const loginRateLimit = createRateLimit({ keyPrefix: 'admin-login', limit: 10, windowMs: 15 * 60_000 });
const passwordRateLimit = createRateLimit({ keyPrefix: 'admin-password', limit: 10, windowMs: 15 * 60_000 });

const handle = (fn: (req: AdminRequest, res: Response) => Promise<unknown>) => asyncRoute<AdminRequest>('AdminAuth', fn);

function describe(adminUser: AdminUser, roles: AdminRole[]) {
  return {
    adminUser: {
      id: adminUser.id,
      email: adminUser.email,
      displayName: adminUser.display_name,
      mustChangePassword: adminUser.must_change_password,
    },
    roles,
  };
}

router.use(noStore);
router.use(adminOriginGuard(config.admin.origins));

router.post('/auth/login', loginRateLimit, handle(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password || email.length > 254 || password.length > 256) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const ip = getClientIp(req);
  const adminUser = await findAdminUserByEmail(email);
  // Always run one scrypt verify, so unknown emails take as long as known ones.
  const valid = await verifyPassword(password, adminUser?.password_hash ?? await getDummyHash());
  const locked = Boolean(adminUser?.locked_until && Date.parse(adminUser.locked_until) > Date.now());

  if (!adminUser || adminUser.status !== 'active' || locked || !valid) {
    if (adminUser) await recordLoginFailure(adminUser.id);
    await recordAudit({
      action: 'login',
      decision: 'denied',
      outcome: 'failed',
      actor_admin_user_id: adminUser?.id ?? null,
      reason: !adminUser ? 'unknown_email' : adminUser.status !== 'active' ? `status_${adminUser.status}` : locked ? 'locked' : 'bad_password',
      ip,
    });
    return res.status(401).json(INVALID_CREDENTIALS);
  }

  await recordLoginSuccess(adminUser.id);
  const token = newSessionToken();
  const session = await createSession({
    adminUserId: adminUser.id,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_MS),
    ip,
    userAgent: req.get('user-agent'),
  });
  await recordAudit({
    action: 'login',
    decision: 'allowed',
    outcome: 'succeeded',
    actor_admin_user_id: adminUser.id,
    actor_session_id: session.id,
    ip,
  });

  res.cookie(cookieName, token, { ...cookieOptions, maxAge: SESSION_ABSOLUTE_MS });
  res.json(describe(adminUser, await getActiveRoles(adminUser.id)));
}));

router.post('/auth/logout', requireAdminSession, handle(async (req, res) => {
  const admin = req.admin!;
  await revokeSession(admin.sessionId);
  await recordAudit({
    action: 'logout',
    decision: 'allowed',
    outcome: 'succeeded',
    actor_admin_user_id: admin.adminUser.id,
    actor_session_id: admin.sessionId,
    ip: getClientIp(req),
  });
  res.clearCookie(cookieName, cookieOptions);
  res.json({ ok: true });
}));

router.get('/auth/me', requireAdminSession, handle(async (req, res) => {
  const admin = req.admin!;
  res.json(describe(admin.adminUser, admin.roles));
}));

router.post('/auth/password', passwordRateLimit, requireAdminSession, handle(async (req, res) => {
  const admin = req.admin!;
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const ip = getClientIp(req);

  if (!(await verifyPassword(currentPassword, admin.adminUser.password_hash))) {
    await recordLoginFailure(admin.adminUser.id);
    await recordAudit({
      action: 'password.change',
      decision: 'denied',
      outcome: 'failed',
      actor_admin_user_id: admin.adminUser.id,
      actor_session_id: admin.sessionId,
      reason: 'bad_current_password',
      ip,
    });
    return res.status(403).json({ error: 'Current password is incorrect' });
  }

  const policyError = checkPasswordPolicy(newPassword, admin.adminUser.email)
    ?? (newPassword === currentPassword ? 'Choose a password you have not used here.' : null);
  if (policyError) return res.status(400).json({ error: policyError });

  await setPassword(admin.adminUser.id, await hashPassword(newPassword), false);
  await revokeOtherSessions(admin.adminUser.id, admin.sessionId);
  await recordAudit({
    action: 'password.change',
    decision: 'allowed',
    outcome: 'succeeded',
    actor_admin_user_id: admin.adminUser.id,
    actor_session_id: admin.sessionId,
    ip,
  });

  const updated = await findAdminUserById(admin.adminUser.id);
  res.json(describe(updated!, admin.roles));
}));

export default router;
