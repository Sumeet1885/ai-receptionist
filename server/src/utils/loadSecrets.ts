import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';

const SSM_PATH = '/ai-receptionist/prod/';
const REGION   = 'ap-south-1';

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

export async function loadSecrets(): Promise<void> {
  const client = new SSMClient({ region: REGION });

  try {
    let nextToken: string | undefined;
    let loaded = 0;

    do {
      const command = new GetParametersByPathCommand({
        Path: SSM_PATH,
        WithDecryption: true,
        Recursive: false,
        NextToken: nextToken,
      });

      const response = await client.send(command);

      for (const param of response.Parameters ?? []) {
        const key = param.Name?.replace(SSM_PATH, '').trim();

        if (key && SSM_MANAGED_KEYS.has(key) && param.Value) {
          process.env[key] = param.Value;
          loaded++;
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    console.log(`[SSM] ✅ Loaded ${loaded}/${SSM_MANAGED_KEYS.size} secret(s) from ${SSM_PATH}`);
  } catch (err) {
    console.warn(
      `[SSM] ⚠️  Could not fetch secrets from SSM — falling back to .env values.\n` +
      `[SSM]     Reason: ${(err as Error).message}`
    );
  }
}
