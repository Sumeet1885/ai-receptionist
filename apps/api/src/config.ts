import dotenv from 'dotenv';
import { clientUrl, emailAssetBase } from './utils/publicUrls';
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const ADMIN_ORIGINS = (process.env.ADMIN_ORIGIN || 'http://127.0.0.1:3000,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export const config = {
  environment: process.env.DEPLOY_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  clientUrl: clientUrl(process.env.CLIENT_URL, process.env.DEPLOY_ENV || 'development'),
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
  aws: {
    region: (process.env.AWS_REGION || 'ap-south-1').trim(),
    // Development SES role; staging/production use the instance role (see src/aws/credentials.ts).
    sesRoleArn: (process.env.AWS_SES_ROLE_ARN || '').trim(),
    s3RoleArn: (process.env.AWS_S3_ROLE_ARN || '').trim(),
  },
  s3: {
    bucket: (process.env.S3_BUCKET_NAME || '').trim(),
    region: (process.env.AWS_S3_REGION || process.env.AWS_REGION || 'ap-south-1').trim(),
  },
  email: {
    assetBaseUrl: emailAssetBase(process.env.EMAIL_ASSET_BASE_URL, clientUrl(process.env.CLIENT_URL, process.env.DEPLOY_ENV || 'development')),
    // Verified SES sender. Without it, development logs emails instead of sending them.
    from: (process.env.EMAIL_FROM || '').trim(),
    fromName: (process.env.EMAIL_FROM_NAME || 'Bolega India').trim(),
    replyTo: (process.env.EMAIL_REPLY_TO || '').trim(),
    region: (process.env.AWS_SES_REGION || process.env.AWS_REGION || 'ap-south-1').trim(),
    // Must match Supabase Auth → Email → "Email OTP expiration" (Supabase default: 1 hour).
    linkExpiryHours: Number(process.env.AUTH_LINK_EXPIRY_HOURS || 1),
  },
  razorpay: {
    // Key id is public (sent to the browser to open Checkout); the secrets stay server-side.
    keyId: (process.env.RAZORPAY_KEY_ID || '').trim(),
    keySecret: (process.env.RAZORPAY_KEY_SECRET || '').trim(),
    webhookSecret: (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(),
  },
  turnstile: {
    // Cloudflare Turnstile secret for public forms. Required outside development.
    secretKey: (process.env.TURNSTILE_SECRET_KEY || '').trim(),
  },
  admin: {
    // Exact origin(s) the admin console is served from (comma-separated); state-changing
    // /api/admin requests and the events socket must come from one of them. Deployed, the console
    // is at /super-admin/ on the app domain, so this is the CLIENT_URL origin. The development
    // default covers http://127.0.0.1:3000/super-admin/ and the same page via localhost.
    origins: ADMIN_ORIGINS,
    // First origin: used for links in emails.
    origin: ADMIN_ORIGINS[0],
    // Path the console is served under (apps/admin vite `base`), used for links in emails.
    basePath: '/super-admin/',
  },
};
