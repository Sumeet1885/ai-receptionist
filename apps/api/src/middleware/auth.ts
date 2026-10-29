import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/db';
import { logger } from '../services/cloudwatchLogger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    emailConfirmedAt?: string | null;
    /** From signup / invite metadata, for greetings. */
    name?: string;
    updatedAt?: string;
  };
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error && (!error.status || error.status === 429 || error.status >= 500)) {
      logger.warn('[Auth] verification service unavailable', { code: error.code, status: error.status, name: error.name });
      return res.status(503).json({ error: 'The sign-in service is temporarily unavailable. Please try again.', code: 'auth_unavailable' });
    }
    if (error || !user) {
      logger.warn('[Auth] access token rejected', { code: error?.code, status: error?.status });
      return res.status(401).json({ error: 'Invalid token', code: 'invalid_token' });
    }

    req.user = { id: user.id, email: user.email, emailConfirmedAt: user.email_confirmed_at ?? null, name: user.user_metadata?.full_name, updatedAt: user.updated_at };
    next();
  } catch (err) {
    logger.warn('[Auth] verification request failed', { name: err instanceof Error ? err.name : 'unknown' });
    res.status(503).json({ error: 'The sign-in service is temporarily unavailable. Please try again.', code: 'auth_unavailable' });
  }
};
