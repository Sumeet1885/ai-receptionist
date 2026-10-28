import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicMarketingPage, signedInRedirect } from '../src/lib/customerRoutes';

test('signed-in marketing routes resume the workspace instead of rendering public pages', () => {
  for (const page of ['landing', 'pricing', 'checkout', 'request-access']) {
    assert.equal(isPublicMarketingPage(page), true);
    assert.equal(signedInRedirect(page, 'active'), '/dashboard');
    assert.equal(signedInRedirect(page, 'onboarding'), '/agents/new');
    assert.equal(signedInRedirect(page, 'verify_email'), '/dashboard');
    assert.equal(signedInRedirect(page, 'payment_required'), '/dashboard');
    assert.equal(signedInRedirect(page, null), '/dashboard');
  }
});

test('customer legal/support/workspace routes remain, guest support is replaced, and recovery is preserved', () => {
  for (const page of ['privacy', 'terms', 'support', 'dashboard', 'agents', 'plans', 'public-chat']) {
    assert.equal(signedInRedirect(page, 'active'), null);
  }
  assert.equal(signedInRedirect('contact-support', 'active'), '/support');
  assert.equal(signedInRedirect('support-guest-ticket', 'active'), '/support');
  assert.equal(signedInRedirect('auth', 'active', 'reset'), null);
  assert.equal(signedInRedirect('auth', 'active', 'signin'), '/dashboard');
});

test('signed-in users leave public auth pages while verification and recovery remain available', () => {
  for (const mode of ['signin', 'signup', 'forgot', 'resend']) {
    assert.equal(signedInRedirect('auth', 'active', mode), '/dashboard');
    assert.equal(signedInRedirect('auth', 'onboarding', mode), '/agents/new');
  }
  for (const type of ['invite', 'magiclink', undefined]) {
    assert.equal(signedInRedirect('auth-confirm', 'active', type), '/dashboard');
    assert.equal(signedInRedirect('auth-confirm', 'set_password', type), '/dashboard');
    assert.equal(signedInRedirect('auth-confirm', 'onboarding', type), '/agents/new');
  }
  assert.equal(signedInRedirect('auth-confirm', 'active', 'recovery'), null);
  assert.equal(signedInRedirect('auth-confirm', 'verify_email', 'invite'), null);
  assert.equal(signedInRedirect('auth-confirm', null, 'invite'), null);
});
