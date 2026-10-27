import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../services/cloudwatchLogger';

// Postgres / PostgREST codes for a table or column the code expects but the database lacks,
// i.e. a migration that has not been applied yet.
const SCHEMA_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205']);
const SCHEMA_MESSAGE = /does not exist|schema cache/i;

export function isSchemaOutOfDate(error: any) {
  return SCHEMA_CODES.has(error?.code) || SCHEMA_MESSAGE.test(String(error?.message ?? ''));
}

// Express 4 does not catch async rejections. Internal error text is logged, never returned; the
// reply carries a short reference that appears in the same log line, so a report can be traced.
export function asyncRoute<R extends Request = Request>(scope: string, fn: (req: R, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, _next: NextFunction) => {
    fn(req as R, res).catch((error: any) => {
      const reference = randomBytes(4).toString('hex');
      if (isSchemaOutOfDate(error)) {
        logger.error(`[${scope}] database is missing a migration; run supabase db push`, { url: req.originalUrl, reference, error: error?.message });
        if (!res.headersSent) {
          res.status(503).json({ error: 'This part of the service is being updated. Please try again in a few minutes.', code: 'schema_out_of_date', reference });
        }
        return;
      }
      logger.error(`[${scope}] request failed`, { url: req.originalUrl, reference, error: error?.message });
      if (!res.headersSent) res.status(500).json({ error: 'Something went wrong on our side. Please try again.', reference });
    });
  };
}
