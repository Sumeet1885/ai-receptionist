import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/cloudwatchLogger';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const botId = (req.params?.botId || req.body?.botId || req.query?.botId) as string | undefined;
    const sessionId = (req.params?.sessionId || req.body?.sessionId || req.query?.sessionId) as string | undefined;

    // Skip noisy healthcheck logs if status 200
    if (req.originalUrl === '/health' && res.statusCode === 200) {
      return;
    }

    logger.http({
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs,
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
      origin: (req.headers['origin'] || req.headers['referer']) as string | undefined,
      botId: typeof botId === 'string' ? botId : undefined,
      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
    });
  });

  next();
}
