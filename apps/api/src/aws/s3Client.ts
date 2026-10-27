import { S3Client } from '@aws-sdk/client-s3';
import { config } from '../config';
import { logger } from '../services/cloudwatchLogger';
import { awsCredentialMode, awsCredentials } from './credentials';

let client: S3Client | null = null;
export function getS3Client() {
  if (!client) {
    client = new S3Client({
      region: config.s3.region,
      credentials: awsCredentials(config.aws.s3RoleArn, 'bolegaindia-s3', config.s3.region),
    });
    logger.info('[aws] S3 client configured', {
      region: config.s3.region,
      bucket: config.s3.bucket,
      credentials: awsCredentialMode(config.aws.s3RoleArn),
    });
  }
  return client;
}
