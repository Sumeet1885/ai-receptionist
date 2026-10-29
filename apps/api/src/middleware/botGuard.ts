import type { NextFunction, Request, Response } from 'express';
import { FORM_ELAPSED_FIELD, HONEYPOT_FIELD, MIN_FORM_FILL_MS } from '@ai-receptionist/contracts';
import { logger } from '../services/cloudwatchLogger';
import { getClientIp } from '../utils/security';

// Cheap bot filter for public forms, run before the Turnstile check: a filled honeypot or a form
// submitted faster than a person can type is rejected. Both fields are removed from the body.
export function botGuard(req: Request, res: Response, next: NextFunction) {
  const body = req.body ?? {};
  const honeypot = body[HONEYPOT_FIELD];
  const elapsedMs = Number(body[FORM_ELAPSED_FIELD]);

  const filledHoneypot = typeof honeypot === 'string' ? honeypot.trim() !== '' : honeypot != null;
  const tooFast = !Number.isFinite(elapsedMs) || elapsedMs < MIN_FORM_FILL_MS;

  if (filledHoneypot || tooFast) {
    logger.warn('[botGuard] rejected public form submission', {
      url: req.originalUrl,
      ip: getClientIp(req),
      reason: filledHoneypot ? 'honeypot' : 'fill-time',
    });
    return res.status(400).json({ error: 'We could not accept this submission. Please reload the page and try again.' });
  }

  delete body[HONEYPOT_FIELD];
  delete body[FORM_ELAPSED_FIELD];
  next();
}
