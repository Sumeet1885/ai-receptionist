import type { CustomerAccount } from './repository';

/**
 * Where a signed-in customer is in their lifecycle. The web app always sends them to this step,
 * so leaving halfway and coming back resumes exactly where they stopped.
 *
 *   not_provisioned → login exists but was never approved (e.g. created before signup was closed)
 *   suspended       → blocked by an admin
 *   verify_email    → email not confirmed yet: no access to anything else
 *   set_password    → activation link used, password not chosen yet
 *   onboarding      → first-time setup (currently: create the first receptionist)
 *   active          → full access
 */
export type AccountStage = 'not_provisioned' | 'suspended' | 'verify_email' | 'set_password' | 'onboarding' | 'active';

export function computeAccountStage(account: Pick<CustomerAccount, 'status' | 'password_set_at' | 'onboarding_completed_at'> | null, emailConfirmed: boolean): AccountStage {
  if (!account) return 'not_provisioned';
  if (account.status === 'suspended') return 'suspended';
  if (!emailConfirmed) return 'verify_email';
  if (!account.password_set_at) return 'set_password';
  if (!account.onboarding_completed_at) return 'onboarding';
  return 'active';
}

// Customer passwords (admins have a stricter policy). Returns an error message or null.
export function checkCustomerPassword(password: unknown, email: string | undefined): string | null {
  if (typeof password !== 'string' || password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 128) return 'Use at most 128 characters.';
  if (email && password.toLowerCase() === email.toLowerCase()) return 'Your password cannot be your email address.';
  if (/^(.)\1+$/.test(password) || ['password', 'password1', '12345678', '123456789', 'qwerty123', 'bolegaindia'].includes(password.toLowerCase())) {
    return 'This password is too easy to guess.';
  }
  return null;
}
