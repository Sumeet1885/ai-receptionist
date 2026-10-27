import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions } from 'express';

export const SESSION_IDLE_MS = 30 * 60_000;
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60_000;
// last_seen_at is written at most this often, not on every request.
export const SESSION_TOUCH_INTERVAL_MS = 60_000;

export const ADMIN_ROLES = ['read_only', 'support', 'super_admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

// `__Host-` requires Secure, which Safari refuses over http://localhost, so development uses a plain name.
export function sessionCookieName(environment: string) {
  return environment === 'development' ? 'admin_session' : '__Host-admin_session';
}

export function sessionCookieOptions(environment: string): CookieOptions {
  return {
    httpOnly: true,
    secure: environment !== 'development',
    sameSite: 'strict',
    path: '/',
  };
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export interface SessionTimes {
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export function isSessionUsable(session: SessionTimes, now = Date.now()) {
  return !session.revoked_at
    && Date.parse(session.expires_at) > now
    && Date.parse(session.last_seen_at) + SESSION_IDLE_MS > now;
}

export function hasRole(roles: AdminRole[], minimum: AdminRole) {
  const required = ADMIN_ROLES.indexOf(minimum);
  return roles.some((role) => ADMIN_ROLES.indexOf(role) >= required);
}
