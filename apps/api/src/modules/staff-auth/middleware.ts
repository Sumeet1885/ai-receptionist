import type { NextFunction, Request, Response } from 'express';
import { config } from '../../config';
import { logger } from '../../services/cloudwatchLogger';
import { getClientIp } from '../../utils/security';
import {
  findPrincipalById,
  findSessionByTokenHash,
  getActiveRoles,
  recordAudit,
  touchSession,
  type StaffPrincipal,
} from './repository';
import {
  hasRole,
  hashSessionToken,
  isSessionUsable,
  readCookie,
  sessionCookieName,
  SESSION_TOUCH_INTERVAL_MS,
  type StaffRole,
} from './session';

export interface StaffRequest extends Request {
  staff?: {
    sessionId: string;
    principal: StaffPrincipal;
    roles: StaffRole[];
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

// CSRF defence on top of SameSite=Strict: state-changing requests must come from the admin origin.
export function adminOriginGuard(allowedOrigin: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.headers.origin !== allowedOrigin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Resolves the session cookie to an active staff member, or null. Shared by REST and WebSocket.
export async function resolveStaffSession(cookieHeader: string | undefined): Promise<StaffRequest['staff'] | null> {
  const token = readCookie(cookieHeader, sessionCookieName(config.environment));
  if (!token) return null;

  const session = await findSessionByTokenHash(hashSessionToken(token));
  if (!session || !isSessionUsable(session)) return null;

  const principal = await findPrincipalById(session.principal_id);
  if (!principal || principal.status !== 'active') return null;

  if (Date.parse(session.last_seen_at) + SESSION_TOUCH_INTERVAL_MS < Date.now()) {
    await touchSession(session.id);
  }

  return { sessionId: session.id, principal, roles: await getActiveRoles(principal.id) };
}

export async function requireStaffSession(req: StaffRequest, res: Response, next: NextFunction) {
  try {
    const staff = await resolveStaffSession(req.headers.cookie);
    if (!staff) return res.status(401).json({ error: 'Not signed in' });
    req.staff = staff;
    next();
  } catch (error: any) {
    logger.error('[StaffAuth] session check failed', { error: error?.message });
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// Deny by default: every admin feature route declares the minimum role it needs.
export function requireStaffRole(minimum: StaffRole) {
  return async (req: StaffRequest, res: Response, next: NextFunction) => {
    const staff = req.staff;
    if (!staff) return res.status(401).json({ error: 'Not signed in' });
    if (staff.principal.must_change_password) {
      return res.status(403).json({ error: 'Change your password to continue', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    if (!hasRole(staff.roles, minimum)) {
      await recordAudit({
        action: `${req.method} ${req.baseUrl}${req.route?.path ?? ''}`,
        decision: 'denied',
        outcome: 'failed',
        actor_principal_id: staff.principal.id,
        actor_session_id: staff.sessionId,
        reason: `requires ${minimum}`,
        ip: getClientIp(req),
      });
      return res.status(403).json({ error: 'Not authorized' });
    }
    next();
  };
}
