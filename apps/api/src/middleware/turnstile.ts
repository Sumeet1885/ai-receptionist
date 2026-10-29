import type { NextFunction, Request, Response } from 'express';
import { TURNSTILE_TOKEN_FIELD } from '@ai-receptionist/contracts';
import { config } from '../config';
import { logger } from '../services/cloudwatchLogger';
import { getClientIp, getHostname } from '../utils/security';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

let warnedMissingSecret = false;

function isDevelopment() {
  // Both flags must say development, so a production box carrying a development .env still checks.
  return config.environment === 'development' && process.env.NODE_ENV !== 'production';
}

/**
 * Verifies the Cloudflare Turnstile token in the JSON body. Mount after the flood limiter and bot
 * guard so cheap rejections happen before the outbound siteverify call.
 *
 * Without TURNSTILE_SECRET_KEY, development skips the check (with one warning); every other
 * environment answers 503 instead of failing open. Outside development the token must have been
 * solved on our own app host (CLIENT_URL), so a token from another site using the same key fails.
 */
export async function verifyTurnstile(req: Request, res: Response, next: NextFunction) {
  const secret = config.turnstile.secretKey;
  const isDev = isDevelopment();

  if (!secret) {
    if (isDev) {
      if (!warnedMissingSecret) {
        warnedMissingSecret = true;
        logger.warn('[Turnstile] TURNSTILE_SECRET_KEY is not set: captcha check skipped (development only).');
      }
      delete req.body?.[TURNSTILE_TOKEN_FIELD];
      return next();
    }
    logger.error('[Turnstile] TURNSTILE_SECRET_KEY is not set: rejecting captcha-protected request.');
    return res.status(503).json({ error: 'Security verification is temporarily unavailable. Please try again later.' });
  }

  const token = req.body?.[TURNSTILE_TOKEN_FIELD];
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) {
    return res.status(400).json({ error: 'Please complete the security verification to continue.' });
  }

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: getClientIp(req) }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.error('[Turnstile] siteverify returned an error status', { status: response.status });
      return res.status(503).json({ error: 'Security verification is temporarily unavailable. Please try again.' });
    }

    const result = (await response.json()) as { success?: boolean; hostname?: string; 'error-codes'?: string[] };
    const expectedHost = isDev ? null : getHostname(config.clientUrl);
    const hostMatches = !expectedHost || result.hostname === expectedHost;

    if (result.success !== true || !hostMatches) {
      // Logged server-side only: codes such as invalid-input-secret describe our configuration.
      logger.warn('[Turnstile] verification failed', {
        codes: result['error-codes']?.join(',') || (hostMatches ? 'unknown' : `hostname ${result.hostname}`),
      });
      return res.status(403).json({ error: 'Security verification failed. Please complete it again.' });
    }

    delete req.body[TURNSTILE_TOKEN_FIELD];
    next();
  } catch (error: any) {
    logger.error('[Turnstile] siteverify request failed', { error: error?.message });
    return res.status(503).json({ error: 'Security verification is temporarily unavailable. Please try again.' });
  }
}
