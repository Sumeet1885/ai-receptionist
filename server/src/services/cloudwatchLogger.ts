export interface LogMetadata {
  [key: string]: unknown;
}

/**
 * Standard structured logger.
 * Emits JSON logs to stdout/stderr.
 *
 * In production/staging, Docker's native `awslogs` logging driver (configured in
 * docker-compose-staging.yml) intercepts these stdout streams and sends them
 * directly to AWS CloudWatch without requiring in-process AWS SDK network calls.
 */
class StandardLogger {
  private formatMessage(level: string, message: string, meta?: LogMetadata): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta || {}),
    });
  }

  public log(level: 'info' | 'warn' | 'error', message: string, meta?: LogMetadata) {
    const formatted = this.formatMessage(level.toUpperCase(), message, meta);
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  public info(message: string, meta?: LogMetadata) {
    this.log('info', message, meta);
  }

  public warn(message: string, meta?: LogMetadata) {
    this.log('warn', message, meta);
  }

  public error(message: string, meta?: LogMetadata) {
    this.log('error', message, meta);
  }

  public http(meta: {
    method: string;
    url: string;
    status: number;
    durationMs: number;
    ip?: string;
    origin?: string;
    botId?: string;
    sessionId?: string;
  }) {
    this.log('info', `${meta.method} ${meta.url} ${meta.status} - ${meta.durationMs}ms`, {
      type: 'HTTP_REQUEST',
      ...meta,
    });
  }

  public voice(event: string, meta?: LogMetadata, level: 'info' | 'warn' | 'error' = 'info') {
    this.log(level, `Voice Event: ${event}`, {
      type: 'VOICE_EVENT',
      event,
      ...(meta || {}),
    });
  }

  public aiReceptionist(action: string, meta?: LogMetadata, level: 'info' | 'warn' | 'error' = 'info') {
    this.log(level, `[AI Receptionist] ${action}`, {
      type: 'AI_RECEPTIONIST_EVENT',
      action,
      ...(meta || {}),
    });
  }

  public callEvent(
    event: 'call_started' | 'call_connected' | 'call_ended' | 'call_failed' | 'call_mirrored' | string,
    meta?: LogMetadata,
    level: 'info' | 'warn' | 'error' = 'info'
  ) {
    this.log(level, `[Call] ${event.toUpperCase()}`, {
      type: 'CALL_EVENT',
      event,
      ...(meta || {}),
    });
  }

  public leadEvent(
    event: 'lead_analyzed' | 'lead_qualified' | 'appointment_booked' | string,
    meta?: LogMetadata,
    level: 'info' | 'warn' | 'error' = 'info'
  ) {
    this.log(level, `[Lead] ${event.toUpperCase()}`, {
      type: 'LEAD_EVENT',
      event,
      ...(meta || {}),
    });
  }

  public async flush(): Promise<void> {
    // No-op: stdout is automatically flushed and captured by Docker awslogs driver
  }
}

export const logger = new StandardLogger();
