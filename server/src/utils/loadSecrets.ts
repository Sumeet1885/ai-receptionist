import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';

// ---------------------------------------------------------------------------
// SSM Secret Loader
// ---------------------------------------------------------------------------
// Fetches sensitive secrets from AWS SSM Parameter Store at startup and merges
// them into process.env BEFORE config.ts is evaluated.
//
// Path convention : /ai-receptionist/prod/<VARIABLE_NAME>
// Region          : ap-south-1 (Mumbai)
// Fallback        : if SSM is unreachable, .env values are used as-is.
// ---------------------------------------------------------------------------

const SSM_PATH = '/ai-receptionist/prod/';
const REGION   = 'ap-south-1';

/**
 * Whitelist of env-var names that are managed in SSM.
 * Only these keys will ever be written into process.env from SSM —
 * everything else (non-secret config) stays in .env.
 */
const SSM_MANAGED_KEYS = new Set<string>([
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'GOOGLE_CLIENT_SECRET',
  'MICROSOFT_CLIENT_SECRET',
  'DOGRAH_API_KEY',
  'PHONE_TOOLS_API_KEY',
]);

/**
 * Loads secrets from AWS SSM Parameter Store and injects them into
 * process.env. Must be called BEFORE importing/evaluating config.ts.
 *
 * Credentials are resolved via the standard AWS credential provider chain:
 *   1. IAM Role attached to the EC2/ECS instance (recommended for prod)
 *   2. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY env vars (local dev)
 *   3. ~/.aws/credentials profile (local dev via AWS CLI)
 */
export async function loadSecrets(): Promise<void> {
  const client = new SSMClient({ region: REGION });

  try {
    let nextToken: string | undefined;
    let loaded = 0;

    do {
      const command = new GetParametersByPathCommand({
        Path: SSM_PATH,
        WithDecryption: true,     // decrypts SecureString params
        Recursive: false,         // only top-level keys under the path
        NextToken: nextToken,
      });

      const response = await client.send(command);

      for (const param of response.Parameters ?? []) {
        // Strip the path prefix to get the bare variable name
        // e.g. "/ai-receptionist/prod/GEMINI_API_KEY" → "GEMINI_API_KEY"
        const key = param.Name?.replace(SSM_PATH, '').trim();

        if (key && SSM_MANAGED_KEYS.has(key) && param.Value) {
          process.env[key] = param.Value; // SSM value takes precedence over .env
          loaded++;
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    console.log(`[SSM] ✅ Loaded ${loaded}/${SSM_MANAGED_KEYS.size} secret(s) from ${SSM_PATH}`);
  } catch (err) {
    // Non-fatal — fall back to whatever values are already in process.env (.env file)
    console.warn(
      `[SSM] ⚠️  Could not fetch secrets from SSM — falling back to .env values.\n` +
      `[SSM]     Reason: ${(err as Error).message}`
    );
  }
}
