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
  const { accessRequestReceived, adminNewAccessRequest, escapeHtml } = await load();
  const hostile = '<script>alert(1)</script>"&';

  const received = accessRequestReceived({ name: hostile });
  assert.ok(!received.html.includes('<script>'));
  assert.ok(received.html.includes(escapeHtml(hostile)));
  assert.ok(received.text.includes(hostile), 'plain text keeps the value as typed');

  const admin = adminNewAccessRequest({
    name: hostile, email: 'a@b.co', phone: '+919876543210', businessName: hostile, industry: 'Healthcare', consoleUrl: 'https://admin.example/x?a=1&b=2',
  });
  assert.ok(!admin.html.includes('<script>'));
  assert.ok(admin.html.includes('href="https://admin.example/x?a=1&amp;b=2"'));
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

test('SES acceptance and failures are logged for strict and safe sends without logging email contents', async () => {
  const { sendEmail, sendEmailSafely, config } = await load();
  const { getSesClient } = await import('../src/aws');
  const { logger } = await import('../src/services/cloudwatchLogger');
  const client = getSesClient();
  const original = { send: client.send, from: config.email.from, info: logger.info, error: logger.error };
  const logs: { message: string; metadata: any }[] = [];
  logger.info = logger.error = (message, metadata) => { logs.push({ message, metadata }); };
  config.email.from = 'sender@example.com';
  const content = { subject: 'private subject', html: 'private token', text: 'private token' };
  try {
    client.send = (async () => ({ MessageId: 'ses-message-id', $metadata: { requestId: 'request-id' } })) as any;
    const result = await sendEmail('customer@example.com', content, 'workspace_activation');
    assert.equal(result.messageId, 'ses-message-id');
    const accepted = logs.find((log) => log.message === '[email] accepted by SES');
    assert.equal(accepted?.metadata.messageId, 'ses-message-id');
    assert.equal(accepted?.metadata.to, 'cu***@example.com');

    const failure = Object.assign(new Error('The security token included in the request is invalid.'), {
      name: 'UnrecognizedClientException', $metadata: { requestId: 'failed-request', httpStatusCode: 403 },
    });
    client.send = (async () => { throw failure; }) as any;
    await assert.rejects(sendEmail('customer@example.com', content, 'workspace_activation'), (error) => error === failure);
    assert.deepEqual(await sendEmailSafely('customer@example.com', content, 'workspace_activation'), { delivered: false });
    const failures = logs.filter((log) => log.message === '[email] send failed');
    assert.equal(failures.length, 2, 'each send logs its failure exactly once');
    assert.equal(failures[0].metadata.errorCode, 'UnrecognizedClientException');
    assert.equal(failures[0].metadata.requestId, 'failed-request');
    assert.equal(failures[0].metadata.httpStatus, 403);
    assert.ok(!JSON.stringify(logs).includes('private token'));
    assert.ok(!JSON.stringify(logs).includes('customer@example.com'));
  } finally {
    client.send = original.send;
    config.email.from = original.from;
    logger.info = original.info;
    logger.error = original.error;
  }
});
