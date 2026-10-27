import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateAccessRequest } from '@ai-receptionist/contracts';

const migrationUrl = new URL('../../../supabase/migrations/20261027130000_access_requests.sql', import.meta.url);
const routesUrl = new URL('../src/modules/access-requests/public.routes.ts', import.meta.url);

const valid = {
  fullName: '  Asha   Patel ',
  email: 'Asha@Example.COM',
  phone: '98765 43219',
  businessName: 'SmileCare Clinic',
  industry: 'Healthcare & clinics',
  website: 'smilecare.in',
  city: 'Pune',
  monthlyVolume: '100_500',
  languages: ['Hindi', 'English', 'Hindi'],
  useCase: 'Answer calls and book appointments.',
  consent: true,
};

test('a valid request is normalised for storage', () => {
  const result = validateAccessRequest(valid);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    fullName: 'Asha Patel',
    email: 'asha@example.com',
    phone: '+919876543219',
    businessName: 'SmileCare Clinic',
    industry: 'Healthcare & clinics',
    website: 'https://smilecare.in/',
    city: 'Pune',
    monthlyVolume: '100_500',
    languages: ['Hindi', 'English'],
    useCase: 'Answer calls and book appointments.',
  });
});

test('optional fields may be omitted', () => {
  const { website, city, monthlyVolume, languages, useCase, ...required } = valid;
  const result = validateAccessRequest(required);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.website, null);
    assert.deepEqual(result.value.languages, []);
  }
});

test('invalid fields are reported individually', () => {
  const result = validateAccessRequest({
    ...valid,
    fullName: 'A',
    email: 'not-an-email',
    phone: '1111111111',
    industry: 'Crypto',
    website: 'nope',
    monthlyVolume: 'lots',
    languages: ['Klingon'],
    useCase: 'x'.repeat(1001),
    consent: false,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(Object.keys(result.errors).sort(), [
    'consent', 'email', 'fullName', 'industry', 'languages', 'monthlyVolume', 'phone', 'useCase', 'website',
  ]);
});

test('non-object input is rejected without throwing', () => {
  for (const input of [null, undefined, 'x', 42, []]) {
    assert.equal(validateAccessRequest(input).ok, false);
  }
});

test('access requests are API-only and allow one open request per email', async () => {
  const sql = await readFile(fileURLToPath(migrationUrl), 'utf8');
  assert.match(sql, /ALTER TABLE public\.access_requests ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.access_requests FROM anon, authenticated/i);
  assert.doesNotMatch(sql, /CREATE POLICY/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS access_requests_open_email_key[\s\S]*WHERE status IN \('pending', 'contacted'\)/i);
  assert.match(sql, /FUNCTION public\.auth_email_exists[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = ''/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.auth_email_exists\(TEXT\) FROM anon/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.auth_email_exists\(TEXT\) TO service_role/i);
});

test('the public route is fully guarded and answers the same way for every outcome', async () => {
  const source = await readFile(fileURLToPath(routesUrl), 'utf8');
  assert.match(source, /\.\.\.publicFormGuards\('access-request', \{ floodPer10Min: \d+, perIpPerHour: \d+, perEmailPerHour: \d+ \}\)/);
  const acknowledgements = source.match(/res\.status\(202\)\.json\(ACKNOWLEDGED\)/g) ?? [];
  assert.equal(acknowledgements.length, 3, 'existing account, open request and new request all get the same reply');
  assert.doesNotMatch(source, /status\(409\)/, 'no response may reveal that a request or account exists');
});
