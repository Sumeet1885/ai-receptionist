import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { botGuard } from './botGuard';
import { createRateLimit } from './rateLimit';
import { verifyTurnstile } from './turnstile';

interface PublicFormLimits {
  // Every attempt, before any outbound call (keeps bots off the Turnstile siteverify endpoint).
  floodPer10Min: number;
  // Only submissions that passed Turnstile count from here on, so requests without a captcha can
  // lock out neither a shared office IP nor someone else's email address.
  perIpPerHour: number;
  perEmailPerHour: number;
}

function emailKey(req: Request) {
  const email = req.body?.email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase().slice(0, 254) : null;
}

export function publicHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

// Browsers always send Origin on cross-origin POSTs; a different site's page cannot submit our forms.
export function publicOriginGuard(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (!origin) return next();
  try {
    const clientOrigin = new URL(config.clientUrl).origin;
    if (origin === clientOrigin) return next();
    const isLoopback = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const clientHost = new URL(config.clientUrl).hostname;
    const originHost = new URL(origin).hostname;
    if (isLoopback(clientHost) && isLoopback(originHost)) return next();
  } catch {
    // continue to reject
  }
  return res.status(403).json({ error: 'Use the form on our website to continue.' });
}

/**
 * Guards for a public, unauthenticated form, in this order:
 *   headers + origin → flood limit → honeypot / fill time → Turnstile → hourly per-IP → hourly per-email.
 * `name` gives each form its own rate-limit buckets.
 */
export function publicFormGuards(name: string, limits: PublicFormLimits) {
  return [
    publicHeaders,
    publicOriginGuard,
    createRateLimit({ keyPrefix: `${name}-flood`, limit: limits.floodPer10Min, windowMs: 10 * 60_000 }),
    botGuard,
    verifyTurnstile,
    createRateLimit({ keyPrefix: `${name}-ip`, limit: limits.perIpPerHour, windowMs: 60 * 60_000 }),
    createRateLimit({ keyPrefix: `${name}-email`, limit: limits.perEmailPerHour, windowMs: 60 * 60_000 }, emailKey),
  ];
}
