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
  environment: process.env.DEPLOY_ENV || 'development',
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
    apiUrl: (process.env.DOGRAH_API_URL || 'http://localhost:8000').trim().replace(/\/+$/, ''),
    apiKey: (process.env.DOGRAH_API_KEY || '').trim(),
    pollIntervalMs: parseInt(process.env.DOGRAH_POLL_INTERVAL_MS || '60000', 10),
  },
  phoneTools: {
    apiKey: (process.env.PHONE_TOOLS_API_KEY || '').trim(),
    callbackBaseUrl: (process.env.PHONE_TOOLS_CALLBACK_BASE_URL || 'http://host.docker.internal:4000').trim().replace(/\/+$/, ''),
  },
  defaultPhoneNumber: (process.env.DEFAULT_PLATFORM_PHONE_NUMBER || process.env.PLATFORM_PHONE_NUMBER || '').trim(),
  email: {
    // Verified SES sender. Without it, development logs emails instead of sending them.
    from: (process.env.EMAIL_FROM || '').trim(),
    fromName: (process.env.EMAIL_FROM_NAME || 'Bolega India').trim(),
    replyTo: (process.env.EMAIL_REPLY_TO || '').trim(),
    region: (process.env.AWS_SES_REGION || process.env.AWS_REGION || 'ap-south-1').trim(),
    // Must match Supabase Auth → Email → "Email OTP expiration" (Supabase default: 1 hour).
    linkExpiryHours: Number(process.env.AUTH_LINK_EXPIRY_HOURS || 1),
    // Who hears about new access requests; falls back to every active super_admin.
    staffNotifications: (process.env.STAFF_NOTIFICATION_EMAILS || '')
      .split(',')
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean),
  },
  turnstile: {
    // Cloudflare Turnstile secret for public forms. Required outside development.
    secretKey: (process.env.TURNSTILE_SECRET_KEY || '').trim(),
  },
  admin: {
    // Exact origin of the staff console; state-changing /api/admin requests must come from it.
    // Default matches `npm run dev:admin` (vite --host 127.0.0.1 --port 3001).
    origin: (process.env.ADMIN_ORIGIN || 'http://127.0.0.1:3001').trim().replace(/\/+$/, ''),
  },
};
