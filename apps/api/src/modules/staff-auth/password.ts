import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt parameters per OWASP (N=2^17, r=8, p=1). Stored with the hash so they can be raised later.
const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

function maxmemFor(n: number, r: number) {
  return 128 * n * r * 2;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: maxmemFor(N, R) });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

// Returns false (never throws) for a wrong password or a malformed stored hash.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;

  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (![params.N, params.r, params.p].every(Number.isSafeInteger)) return false;

  const expected = Buffer.from(keyB64, 'base64');
  try {
    const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
      ...params,
      maxmem: maxmemFor(params.N, params.r),
    });
    return expected.length > 0 && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

// Verified against when the email is unknown, so response time does not reveal which emails exist.
export function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

const COMMON_PASSWORDS = new Set([
  'password1234', 'password12345', 'password123456', '123456789012', 'qwertyuiop12',
  'adminadmin123', 'administrator', 'letmein12345', 'welcome12345', 'iloveyou1234',
  'bolegaindia1', 'bolegaindia123', 'changeme1234', 'superadmin123',
]);

// Returns an error message, or null when the password is acceptable.
export function checkPasswordPolicy(password: string, email: string): string | null {
  if (password.length < 12) return 'Password must be at least 12 characters.';
  if (password.length > 128) return 'Password must be at most 128 characters.';
  const lower = password.toLowerCase();
  const localPart = email.toLowerCase().split('@')[0];
  if (localPart.length >= 4 && lower.includes(localPart)) return 'Password must not contain your email name.';
  if (COMMON_PASSWORDS.has(lower)) return 'This password is too common.';
  return null;
}

export function generateTemporaryPassword() {
  return randomBytes(15).toString('base64url');
}
