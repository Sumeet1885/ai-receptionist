import { Router, type Response } from 'express';
import { config } from '../../config';
import { createRateLimit } from '../../middleware/rateLimit';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import { adminOriginGuard, noStore, requireStaffSession, type StaffRequest } from './middleware';
import { checkPasswordPolicy, getDummyHash, hashPassword, verifyPassword } from './password';
import {
  createSession,
  findPrincipalByEmail,
  findPrincipalById,
  getActiveRoles,
  recordAudit,
  recordLoginFailure,
  recordLoginSuccess,
  revokeOtherSessions,
  revokeSession,
  setPassword,
  type StaffPrincipal,
} from './repository';
import {
  hashSessionToken,
  newSessionToken,
  sessionCookieName,
  sessionCookieOptions,
  SESSION_ABSOLUTE_MS,
  type StaffRole,
} from './session';

const router = Router();

const INVALID_CREDENTIALS = { error: 'Invalid email or password' };
const cookieName = sessionCookieName(config.environment);
const cookieOptions = sessionCookieOptions(config.environment);

const loginRateLimit = createRateLimit({ keyPrefix: 'staff-login', limit: 10, windowMs: 15 * 60_000 });
const passwordRateLimit = createRateLimit({ keyPrefix: 'staff-password', limit: 10, windowMs: 15 * 60_000 });

const handle = (fn: (req: StaffRequest, res: Response) => Promise<unknown>) => asyncRoute<StaffRequest>('StaffAuth', fn);

function describe(principal: StaffPrincipal, roles: StaffRole[]) {
  return {
    principal: {
      id: principal.id,
      email: principal.email,
      displayName: principal.display_name,
      mustChangePassword: principal.must_change_password,
    },
    roles,
  };
}

router.use(noStore);
router.use(adminOriginGuard(config.admin.origin));

router.post('/auth/login', loginRateLimit, handle(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password || email.length > 254 || password.length > 256) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const ip = getClientIp(req);
  const principal = await findPrincipalByEmail(email);
  // Always run one scrypt verify, so unknown emails take as long as known ones.
  const valid = await verifyPassword(password, principal?.password_hash ?? await getDummyHash());
  const locked = Boolean(principal?.locked_until && Date.parse(principal.locked_until) > Date.now());

  if (!principal || principal.status !== 'active' || locked || !valid) {
    if (principal) await recordLoginFailure(principal.id);
    await recordAudit({
      action: 'login',
      decision: 'denied',
      outcome: 'failed',
      actor_principal_id: principal?.id ?? null,
      reason: !principal ? 'unknown_email' : principal.status !== 'active' ? `status_${principal.status}` : locked ? 'locked' : 'bad_password',
      ip,
    });
    return res.status(401).json(INVALID_CREDENTIALS);
  }

  await recordLoginSuccess(principal.id);
  const token = newSessionToken();
  const session = await createSession({
    principalId: principal.id,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_MS),
    ip,
    userAgent: req.get('user-agent'),
  });
  await recordAudit({
    action: 'login',
    decision: 'allowed',
    outcome: 'succeeded',
    actor_principal_id: principal.id,
    actor_session_id: session.id,
    ip,
  });

  res.cookie(cookieName, token, { ...cookieOptions, maxAge: SESSION_ABSOLUTE_MS });
  res.json(describe(principal, await getActiveRoles(principal.id)));
}));

router.post('/auth/logout', requireStaffSession, handle(async (req, res) => {
  const staff = req.staff!;
  await revokeSession(staff.sessionId);
  await recordAudit({
    action: 'logout',
    decision: 'allowed',
    outcome: 'succeeded',
    actor_principal_id: staff.principal.id,
    actor_session_id: staff.sessionId,
    ip: getClientIp(req),
  });
  res.clearCookie(cookieName, cookieOptions);
  res.json({ ok: true });
}));

router.get('/auth/me', requireStaffSession, handle(async (req, res) => {
  const staff = req.staff!;
  res.json(describe(staff.principal, staff.roles));
}));

router.post('/auth/password', passwordRateLimit, requireStaffSession, handle(async (req, res) => {
  const staff = req.staff!;
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const ip = getClientIp(req);

  if (!(await verifyPassword(currentPassword, staff.principal.password_hash))) {
    await recordLoginFailure(staff.principal.id);
    await recordAudit({
      action: 'password.change',
      decision: 'denied',
      outcome: 'failed',
      actor_principal_id: staff.principal.id,
      actor_session_id: staff.sessionId,
      reason: 'bad_current_password',
      ip,
    });
    return res.status(403).json({ error: 'Current password is incorrect' });
  }

  const policyError = checkPasswordPolicy(newPassword, staff.principal.email)
    ?? (newPassword === currentPassword ? 'Choose a password you have not used here.' : null);
  if (policyError) return res.status(400).json({ error: policyError });

  await setPassword(staff.principal.id, await hashPassword(newPassword), false);
  await revokeOtherSessions(staff.principal.id, staff.sessionId);
  await recordAudit({
    action: 'password.change',
    decision: 'allowed',
    outcome: 'succeeded',
    actor_principal_id: staff.principal.id,
    actor_session_id: staff.sessionId,
    ip,
  });

  const updated = await findPrincipalById(staff.principal.id);
  res.json(describe(updated!, staff.roles));
}));

export default router;
