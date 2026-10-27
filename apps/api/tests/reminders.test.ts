import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

const read = (path: string) => readFile(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('a reminder link opens its own order only, and only for a week', async () => {
  const { resumeTokenMatches, RESUME_LINK_TTL_MS } = await import('../src/modules/billing/reminders');
  const token = 'tok_abcdefghijklmnopqrstuvwxyz012345';
  const order = { resume_token_hash: createHash('sha256').update(token).digest('hex'), reminder_sent_at: '2026-10-28T10:00:00Z' };
  const sent = Date.parse(order.reminder_sent_at);

  assert.equal(resumeTokenMatches(order, token, sent + 60_000), true);
  assert.equal(resumeTokenMatches(order, `${token}x`, sent + 60_000), false);
  assert.equal(resumeTokenMatches(order, token, sent + RESUME_LINK_TTL_MS + 1), false, 'expired');
  assert.equal(resumeTokenMatches({ ...order, resume_token_hash: null }, token, sent), false);
  assert.equal(resumeTokenMatches(order, 'short', sent), false);
});

test('reminders: 30 minutes after checkout, 5 after closing, sent once by a claimed sweep', async () => {
  const { REMINDER_AFTER_ABANDON_MS, REMINDER_AFTER_CHECKOUT_MS } = await import('../src/modules/billing/reminders');
  assert.equal(REMINDER_AFTER_ABANDON_MS, 5 * 60_000);
  assert.equal(REMINDER_AFTER_CHECKOUT_MS, 30 * 60_000);

  const routes = await read('../src/modules/billing/public.routes.ts');
  assert.match(routes, /reminder_due_at: new Date\(Date\.now\(\) \+ REMINDER_AFTER_CHECKOUT_MS\)/);
  assert.match(routes, /scheduleReminder\(updated\.id, new Date\(Date\.now\(\) \+ REMINDER_AFTER_ABANDON_MS\)\)/);
  assert.match(routes, /router\.post\('\/checkout\/resume', publicHeaders, resumeLimit/);

  const reminders = await read('../src/modules/billing/reminders.ts');
  // The claim only succeeds for an unpaid order whose reminder has not gone out.
  assert.match(reminders, /\.update\(\{ reminder_sent_at: [^}]+resume_token_hash: hashToken\(token\) \}\)\s*\.eq\('id', id\)\s*\.eq\('status', 'created'\)\s*\.is\('reminder_sent_at', null\)/);
  assert.match(await read('../src/index.ts'), /startCheckoutReminders\(\);/);

  const sql = await read('../../../supabase/migrations/20261028150000_checkout_reminders.sql');
  for (const column of ['reminder_due_at', 'reminder_sent_at', 'resume_token_hash']) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  }
});

test('new customer emails carry their link in HTML and text', async () => {
  const { paymentReminder, passwordChanged, onboardingComplete } = await import('../src/services/email/templates');
  const url = 'https://bolegaindia.ai/checkout?resume=a.b&x=1';
  const reminder = paymentReminder({ name: 'Asha', businessName: 'Rao Clinic', planName: 'AI Growth', amount: '₹31,900', resumeUrl: url, pricingUrl: 'https://bolegaindia.ai/pricing' });
  assert.match(reminder.subject, /Complete your/);
  assert.ok(reminder.html.includes(url.replace(/&/g, '&amp;')) && reminder.text.includes(url));
  assert.ok(reminder.text.includes('₹31,900'));

  const changed = passwordChanged({ email: 'asha@example.com', when: '28 Oct 2026, 3:00 pm IST', resetUrl: 'https://bolegaindia.ai/auth?mode=forgot' });
  assert.match(changed.text, /Not you\?/);
  const done = onboardingComplete({ name: 'Asha', dashboardUrl: 'https://bolegaindia.ai/dashboard' });
  assert.ok(done.html.includes('https://bolegaindia.ai/dashboard'));
  assert.ok(done.html.includes('<img src="') && done.html.includes('alt="Bolega India"'), 'logo header');
});

test('supported languages are one list for the landing page and the access form', async () => {
  const { SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_LIST, ACCESS_REQUEST_LANGUAGES } = await import('@ai-receptionist/contracts');
  assert.deepEqual(SUPPORTED_LANGUAGES.map((l) => l.name), ['Hindi', 'Tamil', 'Telugu', 'Bengali', 'Kannada', 'Malayalam', 'Marathi', 'Gujarati', 'Punjabi', 'Odia', 'Urdu']);
  assert.match(SUPPORTED_LANGUAGE_LIST, /^Hindi, Tamil, .* and Urdu$/);
  assert.deepEqual(ACCESS_REQUEST_LANGUAGES, ['English', ...SUPPORTED_LANGUAGES.map((l) => l.name)]);
});
