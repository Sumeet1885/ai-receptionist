import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { checkCustomerPassword, computeAccountStage } from '../src/modules/accounts/stage';

const accountRoutesUrl = new URL('../src/modules/accounts/account.routes.ts', import.meta.url);
const publicRoutesUrl = new URL('../src/modules/accounts/public.routes.ts', import.meta.url);

const done = { status: 'active' as const, password_set_at: '2026-10-01T00:00:00Z', onboarding_completed_at: '2026-10-02T00:00:00Z' };

test('stage follows the lifecycle and email verification gates everything after it', () => {
  assert.equal(computeAccountStage(null, true), 'not_provisioned');
  assert.equal(computeAccountStage({ ...done, status: 'suspended' }, true), 'suspended');
  assert.equal(computeAccountStage({ ...done }, false), 'verify_email', 'an unverified email blocks even a finished account');
  assert.equal(computeAccountStage({ ...done, password_set_at: null, onboarding_completed_at: null }, true), 'set_password');
  assert.equal(computeAccountStage({ ...done, onboarding_completed_at: null }, true), 'onboarding');
  assert.equal(computeAccountStage(done, true), 'active');
});

test('customer password policy', () => {
  assert.match(checkCustomerPassword('short', 'a@b.co')!, /at least 8/);
  assert.match(checkCustomerPassword(undefined, 'a@b.co')!, /at least 8/);
  assert.match(checkCustomerPassword('x'.repeat(129), 'a@b.co')!, /at most 128/);
  assert.match(checkCustomerPassword('asha@example.com', 'Asha@Example.com')!, /email/);
  assert.match(checkCustomerPassword('aaaaaaaaaa', 'a@b.co')!, /easy to guess/);
  assert.match(checkCustomerPassword('Password', 'a@b.co')!, /easy to guess/);
  assert.equal(checkCustomerPassword('monsoon-chai-42', 'a@b.co'), null);
});

test('account routes require a signed-in user and only set a password after the email is confirmed', async () => {
  const source = await readFile(fileURLToPath(accountRoutesUrl), 'utf8');
  assert.match(source, /router\.use\(requireAuth\);/);
  assert.match(source, /if \(!\['set_password', 'onboarding', 'active', 'scheduled'\]\.includes\(stage\)\)/);
  assert.match(source, /router\.post\('\/password', perUser\('account-password', \d+, [\d_ *]+\)/);
  assert.match(source, /router\.post\('\/verification-email', perUser\('account-verify', 3, [\d_ *]+\)/);
  assert.match(source, /emailConfirmedAt/);
});

test('public account emails are guarded and answer the same whether or not the account exists', async () => {
  const source = await readFile(fileURLToPath(publicRoutesUrl), 'utf8');
  assert.match(source, /router\.post\('\/password-reset', \.\.\.guards\('password-reset'\)/);
  assert.match(source, /router\.post\('\/activation-resend', \.\.\.guards\('activation-resend'\)/);
  assert.equal((source.match(/res\.status\(202\)\.json\(reply\)/g) ?? []).length, 2);
  assert.doesNotMatch(source, /status\(40[49]\)/, 'no response may reveal whether an account exists');
  // Suspended accounts get no reset link; already activated accounts get no activation link.
  assert.match(source, /if \(account\?\.status === 'active'\)/);
  assert.match(source, /!account\.password_set_at/);
});
