import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  LIMITS,
  parseCouponInput,
  parseFeatureList,
  parsePlanInput,
  validateAccessRequest,
  validateAdminNotes,
  validateCheckoutContact,
  validateRejectionReason,
} from '@ai-receptionist/contracts';

const person = { fullName: 'Asha Rao', email: 'asha@example.com', phone: '91234 58207', businessName: 'Rao Clinic', consent: true };
const long = (n: number) => 'a'.repeat(n);

test('names and business names report too short and too long separately', () => {
  const short = validateCheckoutContact({ ...person, fullName: 'A', password: 'monsoon-chai-42' });
  assert.ok('errors' in short);
  assert.match(short.errors.fullName!, /at least 2 characters/);

  const tooLong = validateCheckoutContact({ ...person, businessName: long(LIMITS.businessName.max + 1), password: 'monsoon-chai-42' });
  assert.ok('errors' in tooLong);
  assert.match(tooLong.errors.businessName!, new RegExp(`at most ${LIMITS.businessName.max} characters`));

  const empty = validateAccessRequest({ ...person, fullName: '   ', industry: 'Other' });
  assert.ok('errors' in empty);
  assert.equal(empty.errors.fullName, 'Please enter your full name.');

  const ok = validateAccessRequest({ ...person, fullName: long(LIMITS.personName.max), industry: 'Other' });
  assert.equal(ok.ok, true, 'exactly the maximum is allowed');
});

test('optional fields are checked only when filled', () => {
  const blank = validateAccessRequest({ ...person, industry: 'Other', city: '  ', useCase: '' });
  assert.ok(blank.ok && blank.value.city === null && blank.value.useCase === null);
  const tooLong = validateAccessRequest({ ...person, industry: 'Other', useCase: long(LIMITS.useCase.max + 1) });
  assert.ok('errors' in tooLong && /at most 1000/.test(tooLong.errors.useCase!));
});

test('admin forms reject over-long text instead of silently cutting it', () => {
  const plan = parsePlanInput({ slug: 'ai-pro', name: 'AI Pro', priceInr: 100, tagline: long(LIMITS.planTagline.max + 1), featureValues: { telephony: long(61) } });
  assert.ok('errors' in plan);
  assert.match(plan.errors.tagline!, /at most 200/);
  assert.match(plan.errors['featureValues.telephony']!, /at most 60/);

  assert.match(parsePlanInput({ slug: 'ai-pro', name: 'AI Pro', priceInr: 100, maxAgents: 10_001 }).ok ? '' : 'rejected', /rejected/);
  assert.equal(parseFeatureList([{ label: '' }]).ok, false, 'empty rows are an error, not dropped');
  assert.equal(parseFeatureList(Array.from({ length: LIMITS.featureRows.max + 1 }, (_, i) => ({ label: `Row ${i}` }))).ok, false);

  const notes = validateAdminNotes(long(LIMITS.adminNotes.max + 1));
  assert.ok('errors' in notes && /at most 2000/.test(notes.errors.adminNotes!));
  assert.deepEqual(validateAdminNotes('  '), { ok: true, value: null });
  const reason = validateRejectionReason(long(LIMITS.rejectionReason.max + 1));
  assert.ok('errors' in reason && /at most 1000/.test(reason.errors.reason!));
});

test('coupon code limits match the database constraint', async () => {
  assert.equal(parseCouponInput({ code: 'AB', percentOff: 10 }).ok, false);
  assert.equal(parseCouponInput({ code: long(LIMITS.couponCode.max + 1), percentOff: 10 }).ok, false);
  assert.equal(parseCouponInput({ code: 'A'.repeat(LIMITS.couponCode.max), percentOff: 10 }).ok, true);
  assert.equal(parseCouponInput({ code: '-ABC', percentOff: 10 }).ok, false);

  const sql = await readFile(fileURLToPath(new URL('../../../supabase/migrations/20261028120000_billing.sql', import.meta.url)), 'utf8');
  const [, rest] = /code ~ '\^\[A-Z0-9\]\[A-Z0-9_-\]\{(\d+,\d+)\}\$'/.exec(sql) ?? [];
  assert.equal(rest, `${LIMITS.couponCode.min - 1},${LIMITS.couponCode.max - 1}`);
});
