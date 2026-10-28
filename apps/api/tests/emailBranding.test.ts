import test from 'node:test';
import assert from 'node:assert/strict';
import { withInlineLogo } from '../src/services/email/branding';

test('email logo is embedded with matching CID and real PNG bytes, independent of localhost', () => {
  const input = '<img src="http://localhost:3000/bolegaindia/brand/bolegaindia-logo.png" data-email-logo="brand" alt="Bolega India"><a href="http://localhost:3000/auth/confirm?token_hash=test">Activate</a><img src="https://example.com/unrelated.png">';
  const result = withInlineLogo(input);
  assert.ok(result.html.includes('src="cid:bolega-india-logo"'));
  assert.ok(!result.html.includes('http://localhost:3000/bolegaindia'));
  assert.ok(result.html.includes('http://localhost:3000/auth/confirm?token_hash=test'));
  assert.ok(result.html.includes('https://example.com/unrelated.png'));
  assert.equal(result.attachments.length, 1);
  const attachment = result.attachments[0];
  assert.equal(attachment.ContentId, 'bolega-india-logo');
  assert.equal(attachment.ContentDisposition, 'INLINE');
  assert.equal(attachment.ContentType, 'image/png');
  assert.equal(attachment.ContentTransferEncoding, 'BASE64');
  assert.equal(Buffer.from(attachment.RawContent!).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.deepEqual(withInlineLogo('<p>Plain HTML</p>'), { html: '<p>Plain HTML</p>', attachments: [] });
});
