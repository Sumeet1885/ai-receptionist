import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';

// How every AWS client in the API gets credentials.
//
// - No role ARN: the SDK default chain. Locally that is AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
//   from apps/api/.env; on EC2 it is the instance role.
// - With a role ARN (e.g. AWS_SES_ROLE_ARN): STS AssumeRole, signed with those same base
//   credentials, so developer keys only need sts:AssumeRole and the role holds the real
//   permissions. The SDK refreshes the temporary credentials before they expire, so a dev server
//   left running keeps working after the first hour.

export type AwsCredentialMode = 'assume-role' | 'default-chain';

export function awsCredentialMode(roleArn: string | undefined): AwsCredentialMode {
  return roleArn?.trim() ? 'assume-role' : 'default-chain';
}

const providers = new Map<string, ReturnType<typeof fromTemporaryCredentials>>();

/** Credentials for an AWS client: an auto-refreshing assumed role, or undefined for the default chain. */
export function awsCredentials(roleArn: string | undefined, sessionName: string, region: string) {
  const arn = roleArn?.trim();
  if (!arn) return undefined;

  const key = `${arn}|${sessionName}|${region}`;
  let provider = providers.get(key);
  if (!provider) {
    provider = fromTemporaryCredentials({
      params: { RoleArn: arn, RoleSessionName: sessionName, DurationSeconds: 3600 },
      clientConfig: { region },
    });
    providers.set(key, provider);
  }
  return provider;
}
