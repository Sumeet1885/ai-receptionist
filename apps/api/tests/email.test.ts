import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

const load = async () => ({
  ...(await import('../src/services/email/templates')),
  ...(await import('../src/services/email')),
  ...(await import('../src/config')),
});

test('templates escape user-supplied values in HTML', async () => {
  const { accessRequestReceived, staffNewAccessRequest, escapeHtml } = await load();
  const hostile = '<script>alert(1)</script>"&';

  const received = accessRequestReceived({ name: hostile });
  assert.ok(!received.html.includes('<script>'));
  assert.ok(received.html.includes(escapeHtml(hostile)));
  assert.ok(received.text.includes(hostile), 'plain text keeps the value as typed');

  const staff = staffNewAccessRequest({
    name: hostile, email: 'a@b.co', phone: '+919876543210', businessName: hostile, industry: 'Healthcare', consoleUrl: 'https://admin.example/x?a=1&b=2',
  });
  assert.ok(!staff.html.includes('<script>'));
  assert.ok(staff.html.includes('href="https://admin.example/x?a=1&amp;b=2"'));
});

test('action emails carry the link in both HTML and text, with expiry', async () => {
  const { workspaceActivation, passwordReset, emailVerification } = await load();
  const url = 'https://bolegaindia.ai/auth/confirm?token_hash=abc&type=invite';
  for (const content of [
    workspaceActivation({ name: 'Asha', activationUrl: url, expiresInHours: 24 }),
    passwordReset({ resetUrl: url, expiresInHours: 1 }),
    emailVerification({ verificationUrl: url, expiresInHours: 24 }),
  ]) {
    assert.ok(content.subject.length > 0);
    assert.ok(content.html.includes(url.replace(/&/g, '&amp;')));
    assert.ok(content.text.includes(url));
    assert.match(content.text, /expires in \d+ hours?/);
  }
});

test('without EMAIL_FROM, development logs instead of sending and other environments fail loudly', async () => {
  const { sendEmail, accessRequestReceived, config } = await load();
  const original = { env: config.environment, from: config.email.from, log: console.log };
  const printed: string[] = [];
  console.log = (line: string) => { printed.push(String(line)); };
  try {
    config.email.from = '';
    config.environment = 'development';
    const result = await sendEmail('a@b.co', accessRequestReceived({ name: 'Asha' }), 'access_request_received');
    assert.deepEqual(result, { delivered: false });
    assert.ok(printed.some((line) => line.includes('[email:dev]')));

    config.environment = 'production';
    await assert.rejects(sendEmail('a@b.co', accessRequestReceived({ name: 'Asha' }), 'x'), /EMAIL_FROM/);
  } finally {
    config.environment = original.env;
    config.email.from = original.from;
    console.log = original.log;
  }
});

test('logged addresses are masked', async () => {
  const { maskEmail } = await load();
  assert.equal(maskEmail('asha.patel@example.com'), 'as***@example.com');
  assert.equal(maskEmail('nope'), '***');
});
