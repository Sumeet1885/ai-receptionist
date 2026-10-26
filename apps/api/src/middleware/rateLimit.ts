import { Request, Response, NextFunction } from 'express';
import { getClientIp } from '../utils/security';

interface RateLimitOptions {
  limit: number;
  windowMs: number;
  keyPrefix: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function pruneExpiredBuckets(now: number) {
  if (buckets.size < 1000) return;

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function consumeRateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  pruneExpiredBuckets(now);

  const current = buckets.get(key);
  const bucket = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + options.windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    allowed: bucket.count <= options.limit,
    remaining: Math.max(0, options.limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function createRateLimit(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const result = consumeRateLimit(`${options.keyPrefix}:${ip}`, options);

    res.setHeader('RateLimit-Limit', String(options.limit));
    res.setHeader('RateLimit-Remaining', String(result.remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
      return;
    }

    next();
  };
}

export const widgetRateLimit = createRateLimit({
  keyPrefix: 'widget',
  limit: Number(process.env.WIDGET_RATE_LIMIT_PER_MINUTE || 120),
  windowMs: 60_000,
});

export const chatRateLimit = createRateLimit({
  keyPrefix: 'chat',
  limit: Number(process.env.CHAT_RATE_LIMIT_PER_MINUTE || 60),
  windowMs: 60_000,
});

export function checkWebSocketRateLimit(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }) {
  const ip = getClientIp(req);
  return consumeRateLimit(`live:${ip}`, {
    keyPrefix: 'live',
    limit: Number(process.env.LIVE_VOICE_RATE_LIMIT_PER_MINUTE || 20),
    windowMs: 60_000,
  });
}
