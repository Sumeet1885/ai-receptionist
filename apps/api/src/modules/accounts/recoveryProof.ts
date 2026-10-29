import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

interface RecoveryUser { id: string; updatedAt?: string }
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const sign = (value: string, secret: string) => createHmac('sha256', secret).update(`password-recovery:v1:${value}`).digest();

/** Only issued after the server has consumed a real Supabase recovery OTP. */
export function issueRecoveryProof(token: string, user: RecoveryUser, secret: string, now = Date.now()) {
  if (!user.updatedAt) throw new Error('Recovery verification did not return an account version.');
  const payload = Buffer.from(JSON.stringify({ sub: user.id, token: digest(token), version: user.updatedAt, exp: now + 10 * 60_000 })).toString('base64url');
  return `${payload}.${sign(payload, secret).toString('base64url')}`;
}
export function validRecoveryProof(proof: unknown, token: string, user: RecoveryUser, secret: string, now = Date.now()) {
  try {
    if (typeof proof !== 'string' || proof.length > 2048) return false;
    const [payload, signature, extra] = proof.split('.');
    if (!payload || !signature || extra) return false;
    const actual = Buffer.from(signature, 'base64url'), expected = sign(payload, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims.sub === user.id && claims.token === digest(token) && !!user.updatedAt && claims.version === user.updatedAt
      && typeof claims.exp === 'number' && claims.exp > now && claims.exp <= now + 10 * 60_000;
  } catch { return false; }
}
