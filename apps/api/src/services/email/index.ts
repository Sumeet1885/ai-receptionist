import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { getSesClient } from '../../aws';
import { config } from '../../config';
import { logger } from '../cloudwatchLogger';
import type { EmailContent } from './templates';

export * as emailTemplates from './templates';

export function maskEmail(address: string) {
  const [local, domain] = address.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

export interface SendResult {
  delivered: boolean;
  messageId?: string;
}

/**
 * Sends one transactional email through AWS SES. Without EMAIL_FROM, development prints the email
 * (including any links) to the console so flows can be tested without SES; every other
 * environment throws, because a silently dropped activation email strands the user.
 */
export async function sendEmail(to: string, content: EmailContent, tag: string): Promise<SendResult> {
  const startedAt = Date.now();
  const metadata = { tag, to: maskEmail(to), region: config.email.region };
  logger.info('[email] sending', metadata);

  try {
    return await sendEmailContent(to, content, tag, metadata, startedAt);
  } catch (error: any) {
    logger.error('[email] send failed', {
      ...metadata,
      durationMs: Date.now() - startedAt,
      error: error?.message ?? String(error),
      errorCode: error?.name,
      requestId: error?.$metadata?.requestId,
      httpStatus: error?.$metadata?.httpStatusCode,
    });
    throw error;
  }
}

async function sendEmailContent(to: string, content: EmailContent, tag: string, metadata: Record<string, string>, startedAt: number): Promise<SendResult> {
  if (!config.email.from) {
    if (config.environment === 'development') {
      logger.warn('[email] skipped: EMAIL_FROM is not configured; no email sent', metadata);
      console.log(`\n[email:dev] not sent (EMAIL_FROM unset) — ${tag} to ${to}\nSubject: ${content.subject}\n${content.text}\n`);
      return { delivered: false };
    }
    throw new Error('EMAIL_FROM is not configured');
  }

  const result = await getSesClient().send(new SendEmailCommand({
    FromEmailAddress: `${config.email.fromName} <${config.email.from}>`,
    Destination: { ToAddresses: [to] },
    ReplyToAddresses: config.email.replyTo ? [config.email.replyTo] : undefined,
    Content: {
      Simple: {
        Subject: { Data: content.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: content.html, Charset: 'UTF-8' },
          Text: { Data: content.text, Charset: 'UTF-8' },
        },
      },
    },
    EmailTags: [{ Name: 'type', Value: tag.replace(/[^A-Za-z0-9_-]/g, '_') }],
  }));

  logger.info('[email] accepted by SES', {
    ...metadata,
    messageId: result.MessageId,
    requestId: result.$metadata?.requestId,
    durationMs: Date.now() - startedAt,
  });
  return { delivered: true, messageId: result.MessageId };
}

// For notifications where a failed send must not fail the user's request.
export async function sendEmailSafely(to: string, content: EmailContent, tag: string) {
  try {
    return await sendEmail(to, content, tag);
  } catch {
    return { delivered: false };
  }
}
