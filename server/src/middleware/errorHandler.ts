import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/cloudwatchLogger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`Unhandled error on ${req.method} ${req.url}: ${message}`, {
    status,
    stack: err.stack,
    url: req.originalUrl || req.url,
    method: req.method,
  });

  res.status(status).json({ error: message });
};
