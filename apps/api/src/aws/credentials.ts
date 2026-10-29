import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { createHash } from 'node:crypto';

// Match own-crm: development uses explicit local keys, optionally to assume a service role.
// Staging/production use the default chain (EC2 instance role). Temporary role credentials
// refresh automatically rather than expiring during a long-running development session.
export type AwsCredentialMode = 'assume-role' | 'static-keys' | 'default-chain';

type CredentialEnvironment = {
  DEPLOY_ENV?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SESSION_TOKEN?: string;
};

export function awsCredentialMode(roleArn: string | undefined, env: CredentialEnvironment = process.env): AwsCredentialMode {
  if ((env.DEPLOY_ENV || 'development') !== 'development') return 'default-chain';
  if (roleArn?.trim()) return 'assume-role';
  return env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? 'static-keys' : 'default-chain';
}

const providers = new Map<string, { fingerprint: string; provider: ReturnType<typeof fromTemporaryCredentials> }>();

export function awsCredentials(roleArn: string | undefined, sessionName: string, region: string, env: CredentialEnvironment = process.env) {
  const mode = awsCredentialMode(roleArn, env);
  if (mode === 'default-chain') return undefined;
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required to assume an AWS role in development');
  }
  const credentials = {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    ...(env.AWS_SESSION_TOKEN ? { sessionToken: env.AWS_SESSION_TOKEN } : {}),
  };
  if (mode === 'static-keys') return credentials;

  const arn = roleArn!.trim();
  const key = JSON.stringify([arn, sessionName, region]);
  const fingerprint = createHash('sha256').update(JSON.stringify(credentials)).digest('hex');
  let cached = providers.get(key);
  if (!cached || cached.fingerprint !== fingerprint) {
    const provider = fromTemporaryCredentials({
      masterCredentials: credentials,
      params: { RoleArn: arn, RoleSessionName: sessionName, DurationSeconds: 3600 },
      clientConfig: { region },
    });
    cached = { fingerprint, provider };
    providers.set(key, cached);
  }
  return cached.provider;
}
