import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  InputLogEvent,
} from '@aws-sdk/client-cloudwatch-logs';

export interface LogMetadata {
  [key: string]: unknown;
}

class CloudWatchLogger {
  private client: CloudWatchLogsClient | null = null;
  private logGroupName: string;
  private logStreamName: string;
  private isEnabled: boolean;
  private buffer: InputLogEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isStreamReady = false;
  private isInitializing = false;
  private isFlushing = false;

  constructor() {
    this.isEnabled = process.env.CLOUDWATCH_ENABLED === 'true';
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    this.logGroupName = process.env.CLOUDWATCH_LOG_GROUP || '/aws/ai-receptionist/server';
    const dateStr = new Date().toISOString().slice(0, 10);
    const streamPrefix = process.env.CLOUDWATCH_LOG_STREAM_PREFIX || 'api-';
    this.logStreamName = `${streamPrefix}${dateStr}-${process.pid}`;

    if (this.isEnabled) {
      try {
        this.client = new CloudWatchLogsClient({ region });
        this.startFlushInterval();
      } catch (err: any) {
        console.warn('[cloudwatch] Failed to initialize CloudWatch client, falling back to console:', err?.message);
        this.isEnabled = false;
      }
    }
  }

  private startFlushInterval() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, 2500);
    this.flushTimer.unref?.();
  }

  private async ensureStreamExists(): Promise<boolean> {
    if (this.isStreamReady) return true;
    if (!this.client || !this.isEnabled) return false;

    if (this.isInitializing) {
      // Wait shortly if already initializing
      await new Promise(res => setTimeout(res, 200));
      return this.isStreamReady;
    }

    this.isInitializing = true;
    try {
      try {
        await this.client.send(new CreateLogStreamCommand({
          logGroupName: this.logGroupName,
          logStreamName: this.logStreamName,
        }));
      } catch (err: any) {
        if (err.name === 'ResourceNotFoundException') {
          // Create log group first then retry stream
          try {
            await this.client.send(new CreateLogGroupCommand({
              logGroupName: this.logGroupName,
            }));
            await this.client.send(new CreateLogStreamCommand({
              logGroupName: this.logGroupName,
              logStreamName: this.logStreamName,
            }));
          } catch (createErr: any) {
            if (createErr.name !== 'ResourceAlreadyExistsException') throw createErr;
          }
        } else if (err.name !== 'ResourceAlreadyExistsException') {
          throw err;
        }
      }
      this.isStreamReady = true;
      return true;
    } catch (err: any) {
      console.warn('[cloudwatch] Could not create stream/group in CloudWatch:', err?.message);
      return false;
    } finally {
      this.isInitializing = false;
    }
  }

  private formatMessage(level: string, message: string, meta?: LogMetadata): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta || {}),
    });
  }

  public log(level: 'info' | 'warn' | 'error', message: string, meta?: LogMetadata) {
    const formatted = this.formatMessage(level, message, meta);

    // Always output to local stdout/stderr
    if (level === 'error') {
      console.error(`[${level.toUpperCase()}] ${message}`, meta ? JSON.stringify(meta) : '');
    } else if (level === 'warn') {
      console.warn(`[${level.toUpperCase()}] ${message}`, meta ? JSON.stringify(meta) : '');
    } else {
      console.log(`[${level.toUpperCase()}] ${message}`, meta ? JSON.stringify(meta) : '');
    }

    if (!this.isEnabled || !this.client) return;

    this.buffer.push({
      timestamp: Date.now(),
      message: formatted,
    });

    if (this.buffer.length >= 25) {
      void this.flush();
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

  public callEvent(event: 'call_started' | 'call_connected' | 'call_ended' | 'call_failed' | 'call_mirrored' | string, meta?: LogMetadata, level: 'info' | 'warn' | 'error' = 'info') {
    this.log(level, `[Call] ${event.toUpperCase()}`, {
      type: 'CALL_EVENT',
      event,
      ...(meta || {}),
    });
  }

  public leadEvent(event: 'lead_analyzed' | 'lead_qualified' | 'appointment_booked' | string, meta?: LogMetadata, level: 'info' | 'warn' | 'error' = 'info') {
    this.log(level, `[Lead] ${event.toUpperCase()}`, {
      type: 'LEAD_EVENT',
      event,
      ...(meta || {}),
    });
  }

  public async flush(): Promise<void> {
    if (!this.isEnabled || !this.client || this.buffer.length === 0 || this.isFlushing) {
      return;
    }

    this.isFlushing = true;
    const eventsToSend = this.buffer.splice(0, 100);

    try {
      const ready = await this.ensureStreamExists();
      if (!ready) {
        // Return events to buffer if not ready, but cap buffer size
        if (this.buffer.length < 500) {
          this.buffer.unshift(...eventsToSend);
        }
        return;
      }

      // CloudWatch requires log events sorted chronologically by timestamp
      eventsToSend.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      await this.client.send(new PutLogEventsCommand({
        logGroupName: this.logGroupName,
        logStreamName: this.logStreamName,
        logEvents: eventsToSend,
      }));
    } catch (err: any) {
      console.warn('[cloudwatch] Failed to dispatch log events:', err?.message);
      // Avoid infinite buffer growth on permanent auth failure
      if (this.buffer.length < 500) {
        this.buffer.unshift(...eventsToSend);
      }
    } finally {
      this.isFlushing = false;
    }
  }
}

export const logger = new CloudWatchLogger();
