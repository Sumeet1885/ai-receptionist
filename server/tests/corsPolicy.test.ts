import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCorsOrigin, isTrustedCorsOrigin } from '../src/utils/corsPolicy';

const trustedOrigins = [
  'https://app.example.com',
  'https://api.example.com',
];

test('allows requests without an Origin header', () => {
  assert.equal(isTrustedCorsOrigin(undefined, trustedOrigins), true);
});

test('allows only configured application and backend origins globally', () => {
  assert.equal(isTrustedCorsOrigin('https://app.example.com', trustedOrigins), true);
  assert.equal(isTrustedCorsOrigin('https://api.example.com', trustedOrigins), true);
  assert.equal(isTrustedCorsOrigin('https://evil.example.com', trustedOrigins), false);
});

test('normalizes configured origins before comparison', () => {
  assert.equal(
    isTrustedCorsOrigin('https://app.example.com', ['https://app.example.com/']),
    true,
  );
});

test('applies the validated dynamic widget origin to the response', () => {
  const headers = new Map<string, string>();
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    append(name: string, value: string) {
      headers.set(name, value);
    },
  };

  applyCorsOrigin(response, 'https://customer.example.com');

  assert.equal(headers.get('Access-Control-Allow-Origin'), 'https://customer.example.com');
  assert.equal(headers.get('Vary'), 'Origin');
});
