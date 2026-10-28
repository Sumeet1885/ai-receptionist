import test from 'node:test';
import assert from 'node:assert/strict';
import { clientUrl, emailAssetBase } from '../src/utils/publicUrls';

test('email URL configuration normalizes origins and rejects unsafe or missing production URLs', () => {
  assert.equal(clientUrl(undefined, 'development'), 'http://localhost:3000');
  assert.equal(clientUrl(' https://workspace.example.com/ ', 'production'), 'https://workspace.example.com');
  assert.throws(() => clientUrl(undefined, 'production'), /CLIENT_URL is required/);
  for (const value of ['javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?token=secret', 'https://example.com/#hash']) assert.throws(() => clientUrl(value, 'development'));
  assert.equal(emailAssetBase('', 'https://workspace.example.com'), 'https://workspace.example.com');
  assert.equal(emailAssetBase('https://cdn.example.com/public/', 'https://workspace.example.com'), 'https://cdn.example.com/public');
  assert.throws(() => emailAssetBase('data:image/png;base64,abc', 'https://workspace.example.com'));
});

test('email links and preview logo use configured domains while outgoing logo stays embedded', async () => {
  process.env.SUPABASE_URL ||= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
  process.env.GEMINI_API_KEY ||= 'test';
  const { config } = await import('../src/config');
  const { customerLinkUrl } = await import('../src/modules/accounts/links');
  const { workspaceActivation } = await import('../src/services/email/templates');
  const { withInlineLogo } = await import('../src/services/email/branding');
  const previous = { client: config.clientUrl, assets: config.email.assetBaseUrl };
  try {
    config.clientUrl = 'https://workspace.example.com';
    config.email.assetBaseUrl = 'https://cdn.example.com/public';
    const url = customerLinkUrl('test-token', 'invite');
    assert.equal(url, 'https://workspace.example.com/auth/confirm?token_hash=test-token&type=invite');
    const email = workspaceActivation({ name: 'Test', activationUrl: url, expiresInHours: 1 });
    assert.ok(email.text.includes(url));
    assert.ok(email.html.includes('https://cdn.example.com/public/bolegaindia/brand/bolegaindia-logo.png'));
    const outgoing = withInlineLogo(email.html);
    assert.ok(outgoing.html.includes('src="cid:bolega-india-logo"'));
    assert.ok(!outgoing.html.includes('https://cdn.example.com'));
    assert.equal(outgoing.attachments.length, 1);
  } finally {
    config.clientUrl = previous.client;
    config.email.assetBaseUrl = previous.assets;
  }
});
