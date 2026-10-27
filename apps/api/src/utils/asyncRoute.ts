import type { NextFunction, Request, Response } from 'express';
import { logger } from '../services/cloudwatchLogger';

// Express 4 does not catch async rejections. Internal error text is logged, never returned.
export function asyncRoute<R extends Request = Request>(scope: string, fn: (req: R, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, _next: NextFunction) => {
    fn(req as R, res).catch((error: any) => {
      logger.error(`[${scope}] request failed`, { url: req.originalUrl, error: error?.message });
      if (!res.headersSent) res.status(500).json({ error: 'Something went wrong' });
    });
  };
}
