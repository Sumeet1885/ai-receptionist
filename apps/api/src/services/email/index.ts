import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { config } from '../../config';
import { logger } from '../cloudwatchLogger';
import type { EmailContent } from './templates';

export * as emailTemplates from './templates';

let client: SESv2Client | null = null;

// Credentials come from the default AWS chain: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY locally,
// the EC2 instance role (needs ses:SendEmail) in staging and production.
function sesClient() {
  client ??= new SESv2Client({ region: config.email.region });
  return client;
}

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
  if (!config.email.from) {
    if (config.environment === 'development') {
      console.log(`\n[email:dev] not sent (EMAIL_FROM unset) — ${tag} to ${to}\nSubject: ${content.subject}\n${content.text}\n`);
      return { delivered: false };
    }
    throw new Error('EMAIL_FROM is not configured');
  }

  const result = await sesClient().send(new SendEmailCommand({
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

  logger.info('[email] sent', { tag, to: maskEmail(to), messageId: result.MessageId });
  return { delivered: true, messageId: result.MessageId };
}

// For notifications where a failed send must not fail the user's request.
export async function sendEmailSafely(to: string, content: EmailContent, tag: string) {
  try {
    return await sendEmail(to, content, tag);
  } catch (error: any) {
    logger.error('[email] send failed', { tag, to: maskEmail(to), error: error?.message });
    return { delivered: false };
  }
}
