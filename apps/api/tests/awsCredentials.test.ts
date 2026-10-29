import test from 'node:test';
import assert from 'node:assert/strict';
import { awsCredentialMode, awsCredentials } from '../src/aws/credentials';

const local = { DEPLOY_ENV: 'development', AWS_ACCESS_KEY_ID: 'test-key', AWS_SECRET_ACCESS_KEY: 'test-secret' };
const arn = 'arn:aws:iam::123456789012:role/bolegaindia-ses';

test('development uses explicit local credentials when no role is configured', () => {
  assert.equal(awsCredentialMode('', local), 'static-keys');
  assert.deepEqual(awsCredentials('', 'test', 'ap-south-1', local), {
    accessKeyId: 'test-key', secretAccessKey: 'test-secret',
  });
  assert.equal(awsCredentials('', 'test', 'ap-south-1', {}), undefined);
});

test('development assumes a configured role with a reusable refreshing provider', () => {
  assert.equal(awsCredentialMode(arn, local), 'assume-role');
  const provider = awsCredentials(arn, 'test', 'ap-south-1', local);
  assert.equal(typeof provider, 'function');
  assert.equal(awsCredentials(` ${arn} `, 'test', 'ap-south-1', local), provider);
  assert.notEqual(awsCredentials(arn, 'other', 'ap-south-1', local), provider);
  assert.notEqual(awsCredentials(arn, 'test', 'ap-south-1', { ...local, AWS_SECRET_ACCESS_KEY: 'changed' }), provider);
  assert.throws(() => awsCredentials(arn, 'test', 'ap-south-1', {}), /required to assume/);
});

test('staging and production use the ambient instance role rather than development role settings', () => {
  for (const DEPLOY_ENV of ['staging', 'production']) {
    const env = { ...local, DEPLOY_ENV };
    assert.equal(awsCredentialMode(arn, env), 'default-chain');
    assert.equal(awsCredentials(arn, 'test', 'ap-south-1', env), undefined);
  }
});

test('temporary source credentials retain their session token', () => {
  const credentials = awsCredentials('', 'test', 'ap-south-1', { ...local, AWS_SESSION_TOKEN: 'test-token' });
  assert.equal(typeof credentials === 'object' && credentials.sessionToken, 'test-token');
});
