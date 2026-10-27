import test from 'node:test';
import assert from 'node:assert/strict';
import { awsCredentialMode, awsCredentials } from '../src/aws/credentials';

test('without a role ARN clients use the default credential chain', () => {
  assert.equal(awsCredentialMode(''), 'default-chain');
  assert.equal(awsCredentialMode('   '), 'default-chain');
  assert.equal(awsCredentialMode(undefined), 'default-chain');
  assert.equal(awsCredentials('', 'test', 'ap-south-1'), undefined);
});

test('with a role ARN clients assume it through a reusable, auto-refreshing provider', () => {
  const arn = 'arn:aws:iam::123456789012:role/bolegaindia-ses';
  assert.equal(awsCredentialMode(arn), 'assume-role');

  const provider = awsCredentials(arn, 'test', 'ap-south-1');
  assert.equal(typeof provider, 'function');
  assert.equal(awsCredentials(` ${arn} `, 'test', 'ap-south-1'), provider, 'same role, session and region reuse one provider');
  assert.notEqual(awsCredentials(arn, 'other', 'ap-south-1'), provider);
});
