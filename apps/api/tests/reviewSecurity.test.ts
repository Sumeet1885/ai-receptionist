import test from 'node:test';
import assert from 'node:assert/strict';
import { publicWebhookAddress, parseWebhookUrl, webhookDestination, sendWebhook } from '../src/services/safeWebhook';
import { checkAllowedOrigin, getClientIp } from '../src/utils/security';
import { issueRecoveryProof, validRecoveryProof } from '../src/modules/accounts/recoveryProof';

test('CRM rejects private, metadata, mapped IPv6 and alternate-form addresses before connecting', async () => {
  for (const address of ['127.0.0.1','10.0.0.5','169.254.169.254','172.16.1.2','192.168.1.1','100.64.1.1','0.0.0.0','224.1.2.3','::1','fc00::1','fe80::1','::ffff:127.0.0.1','64:ff9b::7f00:1','2002:7f00:1::']) assert.equal(publicWebhookAddress(address), false, address);
  assert.equal(publicWebhookAddress('8.8.8.8'), true);
  assert.equal(publicWebhookAddress('2606:4700:4700::1111'), true);
  for (const url of ['http://127.1','http://2130706433','http://0x7f000001','http://[::ffff:127.0.0.1]','http://169.254.169.254/latest/meta-data/']) await assert.rejects(sendWebhook(url, {}, '{}', 500));
  assert.throws(() => parseWebhookUrl('http://crm.example', true));
  assert.throws(() => parseWebhookUrl('https://user:secret@crm.example'));
});
test('CRM validates every DNS answer and pins a public result', async () => {
  const url = new URL('https://crm.example');
  await assert.rejects(webhookDestination(url, (async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]) as any));
  assert.deepEqual(await webhookDestination(url, (async () => [{ address: '8.8.8.8', family: 4 }]) as any), { address: '8.8.8.8', family: 4 });
});
test('spoofed forwarding and Host headers confer no widget authorization or new limiter identity', () => {
  const req = { headers: { origin: 'https://attacker.invalid', host: 'attacker.invalid', 'x-forwarded-host': 'attacker.invalid', 'x-forwarded-for': '198.51.100.1' }, ip: '192.0.2.1', socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(checkAllowedOrigin(req, { allowedDomains: ['customer.example'], extraAllowedOrigins: ['https://app.example'], requireSource: true }).allowed, false);
  assert.equal(getClientIp(req), '192.0.2.1');
  req.headers['x-forwarded-for'] = '198.51.100.2'; assert.equal(getClientIp(req), '192.0.2.1');
  assert.equal(getClientIp({ headers: req.headers, socket: req.socket }), '127.0.0.1');
  req.headers.origin = 'https://app.example'; assert.equal(checkAllowedOrigin(req, { extraAllowedOrigins: ['https://app.example'], requireSource: true }).allowed, true);
});
test('recovery grants expire, cannot be forged or transferred, and stop after account changes', () => {
  const owner = { id: 'owner', updatedAt: 'version-one' }, now = Date.now();
  const proof = issueRecoveryProof('validated-recovery-session', owner, 'test-key', now);
  assert.equal(validRecoveryProof(proof, 'validated-recovery-session', owner, 'test-key', now), true);
  assert.equal(validRecoveryProof(proof, 'other-session', owner, 'test-key', now), false);
  assert.equal(validRecoveryProof(proof, 'validated-recovery-session', { ...owner, id: 'other' }, 'test-key', now), false);
  assert.equal(validRecoveryProof(proof, 'validated-recovery-session', { ...owner, updatedAt: 'version-two' }, 'test-key', now), false);
  assert.equal(validRecoveryProof(proof, 'validated-recovery-session', owner, 'test-key', now + 600000), false);
  assert.equal(validRecoveryProof(proof + 'tampered', 'validated-recovery-session', owner, 'test-key', now), false);
});
