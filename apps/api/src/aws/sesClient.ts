import { SESv2Client } from '@aws-sdk/client-sesv2';
import { config } from '../config';
import { logger } from '../services/cloudwatchLogger';
import { awsCredentialMode, awsCredentials } from './credentials';

let client: SESv2Client | null = null;

// SES v2 client, created on first use. The identity needs ses:SendEmail on the EMAIL_FROM identity
// (instance role on EC2, or AWS_SES_ROLE_ARN when set; see ./credentials).
export function getSesClient() {
  if (!client) {
    const region = config.email.region;
    client = new SESv2Client({
      region,
      credentials: awsCredentials(config.aws.sesRoleArn, 'bolegaindia-ses', region),
    });
    logger.info('[aws] SES client ready', { region, credentials: awsCredentialMode(config.aws.sesRoleArn) });
  }
  return client;
}
