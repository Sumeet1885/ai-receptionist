import test from 'node:test';
import assert from 'node:assert/strict';
import * as contactModule from '../src/utils/contactValidation';

test('live contact collection exposes a server-owned state machine', () => {
  assert.equal(typeof (contactModule as any).LiveContactCollection, 'function');
});

test('a pending field cannot be replaced before a valid submission arrives', () => {
  const Collection = (contactModule as any).LiveContactCollection;
  const collection = new Collection();

  assert.deepEqual(collection.request('phone'), { accepted: true, field: 'phone' });
  assert.deepEqual(collection.request('email'), {
    accepted: false,
    error: 'phone input is still pending',
  });
  assert.equal(collection.pendingField, 'phone');
});

test('invalid or mismatched submissions keep the requested field pending', () => {
  const Collection = (contactModule as any).LiveContactCollection;
  const collection = new Collection();
  collection.request('phone');

  assert.equal(collection.submit('email', 'person@example.com').accepted, false);
  assert.equal(collection.submit('phone', '1111111111').accepted, false);
  assert.equal(collection.pendingField, 'phone');
  assert.equal(collection.getVerified('phone'), null);
});

test('only a validated submission clears pending state and becomes verified', () => {
  const Collection = (contactModule as any).LiveContactCollection;
  const collection = new Collection();
  collection.request('phone');

  assert.deepEqual(collection.submit('phone', '9415072638'), {
    accepted: true,
    field: 'phone',
    value: '9415072638',
  });
  assert.equal(collection.pendingField, null);
  assert.equal(collection.getVerified('phone'), '9415072638');
});

test('booking remains blocked until every configured contact field is verified', () => {
  const Collection = (contactModule as any).LiveContactCollection;
  const collection = new Collection();

  assert.deepEqual(collection.getMissingVerified(['phone', 'email']), ['phone', 'email']);

  collection.request('phone');
  collection.submit('phone', '9415072638');
  assert.deepEqual(collection.getMissingVerified(['phone', 'email']), ['email']);

  collection.request('email');
  collection.submit('email', 'person@example.com');
  assert.deepEqual(collection.getMissingVerified(['phone', 'email']), []);
});

test('booking contact guard rejects pending, same-batch, and missing contact states', () => {
  const Collection = (contactModule as any).LiveContactCollection;
  const getBookingError = (contactModule as any).getLiveBookingContactError;
  const collection = new Collection();

  assert.equal(typeof getBookingError, 'function');
  assert.match(getBookingError(collection, ['phone', 'email'], true), /pending/i);
  assert.match(getBookingError(collection, ['phone', 'email'], false), /phone/i);

  collection.request('phone');
  assert.match(getBookingError(collection, ['phone', 'email'], false), /pending/i);
  collection.submit('phone', '9415072638');
  assert.match(getBookingError(collection, ['phone', 'email'], false), /email/i);

  collection.request('email');
  collection.submit('email', 'person@example.com');
  assert.equal(getBookingError(collection, ['phone', 'email'], false), null);
});

test('model output stays blocked until the pending textbox value is server-verified', () => {
  const Collection = (contactModule as any).LiveContactCollection;
  const canForward = (contactModule as any).canForwardLiveModelOutput;
  const collection = new Collection();

  assert.equal(typeof canForward, 'function');
  assert.equal(canForward(collection), true);

  collection.request('email');
  assert.equal(canForward(collection), false);

  collection.submit('email', '');
  assert.equal(canForward(collection), false);

  collection.submit('email', 'person@example.com');
  assert.equal(canForward(collection), true);
});

test('a typed value cannot mutate verified state without its matching Gemini tool call', () => {
  const Collection = (contactModule as any).LiveContactCollection;
  const submitForTool = (contactModule as any).submitLiveContactForTool;
  const collection = new Collection();
  collection.request('phone');

  assert.equal(typeof submitForTool, 'function');
  const result = submitForTool(collection, null, 'phone', '+919415072638');

  assert.equal(result.accepted, false);
  assert.equal(collection.pendingField, 'phone');
  assert.equal(collection.getVerified('phone'), null);
});

test('booking arguments use server-verified phone and email, never Gemini guesses', () => {
  const Collection = (contactModule as any).LiveContactCollection;
  const applyVerified = (contactModule as any).applyVerifiedContactDetails;
  const collection = new Collection();

  collection.request('phone');
  collection.submit('phone', '+919415072638');
  collection.request('email');
  collection.submit('email', 'real@example.com');

  assert.equal(typeof applyVerified, 'function');
  assert.deepEqual(
    applyVerified(collection, {
      visitorPhone: '+911111111111',
      visitorEmail: 'invented@example.com',
      visitorName: 'Visitor',
    }),
    {
      visitorPhone: '+919415072638',
      visitorEmail: 'real@example.com',
      visitorName: 'Visitor',
    }
  );
});
