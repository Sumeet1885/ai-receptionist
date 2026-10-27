import { config } from '../../config';
import { supabase } from '../../services/db';

// One-time links for customer logins. Supabase generates the token (no Supabase email is sent);
// we email our own link to the web app, which verifies it with supabase.auth.verifyOtp after the
// person clicks "Continue" (so mail scanners that prefetch links cannot use it up).

export type CustomerLinkType = 'invite' | 'magiclink' | 'recovery';

export function customerLinkUrl(hashedToken: string, type: CustomerLinkType) {
  const params = new URLSearchParams({ token_hash: hashedToken, type });
  return `${config.clientUrl}/auth/confirm?${params.toString()}`;
}

async function generate(type: CustomerLinkType, email: string, data?: Record<string, string>) {
  const { data: result, error } = await supabase.auth.admin.generateLink(
    type === 'invite'
      ? { type, email, options: { data, redirectTo: `${config.clientUrl}/auth/confirm` } }
      : { type, email, options: { redirectTo: `${config.clientUrl}/auth/confirm` } },
  );
  if (error || !result?.properties?.hashed_token || !result.user) {
    throw new Error(`generate ${type} link: ${error?.message ?? 'no token returned'}`);
  }
  return { userId: result.user.id, url: customerLinkUrl(result.properties.hashed_token, type) };
}

/**
 * Activation link for a provisioned workspace. The first one creates the Supabase user (invite).
 * Later ones re-invite while the email is unconfirmed, or send a sign-in link once it is confirmed
 * but no password has been chosen yet. Either way the click proves the inbox.
 */
export async function createActivationLink(input: { email: string; userId?: string | null; fullName: string; businessName: string }) {
  if (input.userId) {
    const { data, error } = await supabase.auth.admin.getUserById(input.userId);
    if (error || !data?.user) throw new Error(`load user: ${error?.message ?? 'not found'}`);
    if (data.user.email_confirmed_at) return generate('magiclink', input.email);
  }
  return generate('invite', input.email, { full_name: input.fullName, business_name: input.businessName });
}

export function createVerificationLink(email: string) {
  return generate('magiclink', email);
}

export function createRecoveryLink(email: string) {
  return generate('recovery', email);
}
