import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/db';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    emailConfirmedAt?: string | null;
    /** From signup / invite metadata, for greetings. */
    name?: string;
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
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = { id: user.id, email: user.email, emailConfirmedAt: user.email_confirmed_at ?? null, name: user.user_metadata?.full_name };
    next();
  } catch (err) {
    res.status(500).json({ error: 'Authentication failed' });
  }
};
