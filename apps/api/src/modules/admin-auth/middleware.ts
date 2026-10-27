import type { NextFunction, Request, Response } from 'express';
import { config } from '../../config';
import { logger } from '../../services/cloudwatchLogger';
import { getClientIp } from '../../utils/security';
import {
  findAdminUserById,
  findSessionByTokenHash,
  getActiveRoles,
  recordAudit,
  touchSession,
  type AdminUser,
} from './repository';
import {
  hasRole,
  hashSessionToken,
  isSessionUsable,
  readCookie,
  sessionCookieName,
  SESSION_TOUCH_INTERVAL_MS,
  type AdminRole,
} from './session';

export interface AdminRequest extends Request {
  admin?: {
    sessionId: string;
    adminUser: AdminUser;
    roles: AdminRole[];
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

// CSRF defence on top of SameSite=Strict: state-changing requests must come from the admin origin.
export function adminOriginGuard(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (!req.headers.origin || !allowedOrigins.includes(req.headers.origin)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Resolves the session cookie to an active admin, or null. Shared by REST and WebSocket.
export async function resolveAdminSession(cookieHeader: string | undefined): Promise<AdminRequest['admin'] | null> {
  const token = readCookie(cookieHeader, sessionCookieName(config.environment));
  if (!token) return null;

  const session = await findSessionByTokenHash(hashSessionToken(token));
  if (!session || !isSessionUsable(session)) return null;

  const adminUser = await findAdminUserById(session.admin_user_id);
  if (!adminUser || adminUser.status !== 'active') return null;

  if (Date.parse(session.last_seen_at) + SESSION_TOUCH_INTERVAL_MS < Date.now()) {
    await touchSession(session.id);
  }

  return { sessionId: session.id, adminUser, roles: await getActiveRoles(adminUser.id) };
}

export async function requireAdminSession(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const admin = await resolveAdminSession(req.headers.cookie);
    if (!admin) return res.status(401).json({ error: 'Not signed in' });
    req.admin = admin;
    next();
  } catch (error: any) {
    logger.error('[AdminAuth] session check failed', { error: error?.message });
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// Deny by default: every admin feature route declares the minimum role it needs.
export function requireAdminRole(minimum: AdminRole) {
  return async (req: AdminRequest, res: Response, next: NextFunction) => {
    const admin = req.admin;
    if (!admin) return res.status(401).json({ error: 'Not signed in' });
    if (admin.adminUser.must_change_password) {
      return res.status(403).json({ error: 'Change your password to continue', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    if (!hasRole(admin.roles, minimum)) {
      await recordAudit({
        action: `${req.method} ${req.baseUrl}${req.route?.path ?? ''}`,
        decision: 'denied',
        outcome: 'failed',
        actor_admin_user_id: admin.adminUser.id,
        actor_session_id: admin.sessionId,
        reason: `requires ${minimum}`,
        ip: getClientIp(req),
      });
      return res.status(403).json({ error: 'Not authorized' });
    }
    next();
  };
}
