import dotenv from 'dotenv';
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseServiceKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  geminiApiKey: requireEnv('GEMINI_API_KEY'),
  groqApiKey: process.env.GROQ_API_KEY || '',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/calendar/callback/google',
  },
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:4000/api/calendar/callback/outlook',
  },
  dograh: {
    apiUrl: process.env.DOGRAH_API_URL || 'http://localhost:8000',
    email: process.env.DOGRAH_EMAIL || '',
    password: process.env.DOGRAH_PASSWORD || '',
    pollIntervalMs: parseInt(process.env.DOGRAH_POLL_INTERVAL_MS || '60000', 10),
  },
  // Lets Dograh's container call back into this server mid-call (calendar tool calls, pre-call
  // session creation). Server-to-server only - never exposed to the browser, distinct from the
  // public Cloudflare tunnel used for inbound telephony webhooks.
  phoneTools: {
    apiKey: process.env.PHONE_TOOLS_API_KEY || '',
    callbackBaseUrl: process.env.PHONE_TOOLS_CALLBACK_BASE_URL || 'http://host.docker.internal:4000',
  },
};
