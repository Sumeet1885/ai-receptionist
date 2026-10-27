import { LIMITS } from './limits';

// Password rules. Length and "not guessable" checks rather than forced symbols or capitals:
// long, uncommon passphrases are both easier to remember and harder to crack.

const COMMON_CUSTOMER_PASSWORDS = new Set(['password', 'password1', '12345678', '123456789', 'qwerty123', 'bolegaindia']);

const COMMON_ADMIN_PASSWORDS = new Set([
  'password1234', 'password12345', 'password123456', '123456789012', 'qwertyuiop12',
  'adminadmin123', 'administrator', 'letmein12345', 'welcome12345', 'iloveyou1234',
  'bolegaindia1', 'bolegaindia123', 'changeme1234', 'superadmin123',
]);

/** Customer logins. Returns a message, or null when the password is acceptable. */
export function checkCustomerPassword(password: unknown, email: string | undefined): string | null {
  const { min, max } = LIMITS.customerPassword;
  if (typeof password !== 'string' || password.length < min) return `Use at least ${min} characters.`;
  if (password.length > max) return `Use at most ${max} characters.`;
  if (email && password.toLowerCase() === email.toLowerCase()) return 'Your password cannot be your email address.';
  if (/^(.)\1+$/.test(password) || COMMON_CUSTOMER_PASSWORDS.has(password.toLowerCase())) {
    return 'This password is too easy to guess.';
  }
  return null;
}

/** Admin console accounts (stricter). Returns a message, or null when acceptable. */
export function checkAdminPassword(password: string, email: string): string | null {
  const { min, max } = LIMITS.adminPassword;
  if (password.length < min) return `Password must be at least ${min} characters.`;
  if (password.length > max) return `Password must be at most ${max} characters.`;
  const lower = password.toLowerCase();
  const localPart = email.toLowerCase().split('@')[0];
  if (localPart.length >= 4 && lower.includes(localPart)) return 'Password must not contain your email name.';
  if (COMMON_ADMIN_PASSWORDS.has(lower)) return 'This password is too common.';
  return null;
}
