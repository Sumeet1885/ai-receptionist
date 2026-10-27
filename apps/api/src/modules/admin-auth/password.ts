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

// Admin password rules live with the other shared validation (the console checks them too).
export { checkAdminPassword as checkPasswordPolicy } from '@ai-receptionist/contracts';

export function generateTemporaryPassword() {
  return randomBytes(15).toString('base64url');
}
