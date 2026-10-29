import type { Request, Response, NextFunction } from 'express';
import { getCustomerAccount } from '../modules/accounts/repository';
import { supabase } from '../services/db';
import type { AuthRequest } from './auth';

export function workspaceIsBlocked(
  account: {
    status: string;
    access_months?: number | null;
    access_starts_at?: string | null;
  plan_started_at?: string | null;
    trial_days?: number | null;
    trial_started_at?: string | null;
    access_expires_at?: string | null;
  } | null,
  now = Date.now(),
) {
  return (
    !account ||
    account.status === 'suspended' ||
    (account.trial_days != null && !account.trial_started_at) ||
    (!!account.access_starts_at && Date.parse(account.access_starts_at) > now) ||
    (account.access_months != null && !account.plan_started_at) ||
    (!!account.access_expires_at &&
      Date.parse(account.access_expires_at) <= now)
  );
}
export async function workspaceAllowed(userId: string) {
  return !workspaceIsBlocked(await getCustomerAccount(userId));
}
export async function requireWorkspaceAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user || !(await workspaceAllowed(req.user.id)))
      return res
        .status(403)
        .json({
          error: 'Your workspace requires an active plan.',
          code: 'workspace_locked',
        });
    next();
  } catch {
    res
      .status(503)
      .json({ error: 'Could not verify workspace access. Please try again.' });
  }
}
export async function requireBotWorkspace(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { data, error } = await supabase
      .from('bots')
      .select('owner_id')
      .eq('id', req.params.botId)
      .maybeSingle();
    if (error) throw error;
    if (!data || !(await workspaceAllowed(data.owner_id)))
      return res
        .status(403)
        .json({
          error: 'This receptionist is not available.',
          code: 'workspace_locked',
        });
    next();
  } catch {
    res.status(503).json({ error: 'Could not verify receptionist access.' });
  }
}
