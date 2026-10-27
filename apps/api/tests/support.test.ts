import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { SUPPORT_CATEGORIES, supportFileError, validateSupport } from '@ai-receptionist/contracts';
import {
  customerSupportView,
  hashSupportToken,
  newSupportToken,
  supportBytesMatch,
  validSupportToken,
} from '../src/modules/support/security';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

test('support validates guest identity and normalizes text without accepting priority or ownership', () => {
  const input = {
    name: ' Asha ',
    email: 'ASHA@EXAMPLE.COM',
    phone: '+919876542310',
    category: 'billing',
    subject: '',
    description: ' Need help\r\nwith billing. ',
  };
  const result = validateSupport(input, true);
  assert.equal(result.ok, true);
  assert.equal(result.value.email, 'asha@example.com');
  assert.equal(result.value.description, 'Need help\nwith billing.');
  assert.equal(validateSupport({ ...input, email: 'bad', phone: 'bad' }, true).ok, false);
  assert.equal(validateSupport({ ...input, description: 'x'.repeat(5001) }, true).ok, false);
});

test('customer projection excludes admin metadata, internal notes and private storage keys', () => {
  const result = customerSupportView({
    id: 'ticket',
    ticket_number: 1,
    subject: 'Help',
    category: 'general',
    status: 'open',
    created_at: '',
    updated_at: '',
    priority: 'critical',
    email: 'private@example.com',
    guest_token_hash: 'secret',
    assigned_admin_id: 'admin-id',
    admin_unread: true,
    messages: [
      { id: 'internal', body: 'Internal investigation', is_internal: true },
      {
        id: 'public',
        body: 'We can help',
        sender_type: 'admin',
        sender_name: 'Private admin identity',
        sender_email: 'admin@example.com',
        is_internal: false,
        attachments: [
          {
            id: 'file',
            storage_key: 'private-path',
            file_name: 'image.png',
            file_size: 100,
            content_type: 'image/png',
          },
        ],
      },
    ],
  });
  const text = JSON.stringify(result);
  for (const secret of [
    'critical',
    'private@example.com',
    'secret',
    'admin-id',
    'Internal investigation',
    'Private admin identity',
    'admin@example.com',
    'private-path',
  ])
    assert.ok(!text.includes(secret));
  assert.equal(result.messages?.[0].sender_name, 'Support team');
  assert.equal(result.messages?.length, 1);
});

test('guest tokens are unpredictable, hashed at rest, and strictly shaped', () => {
  const a = newSupportToken();
  const b = newSupportToken();
  assert.notEqual(a, b);
  assert.equal(validSupportToken(a), true);
  assert.equal(validSupportToken('bad'), false);
  assert.equal(validSupportToken(`${a}/`), false);
  assert.match(hashSupportToken(a), /^[a-f0-9]{64}$/);
  assert.notEqual(hashSupportToken(a), a);
});

test('uploads reject executable, GIF, oversized and forged files', () => {
  assert.ok(supportFileError([{ name: 'script.svg', type: 'image/svg+xml', size: 50 }], true));
  assert.ok(supportFileError([{ name: 'image.gif', type: 'image/gif', size: 50 }], true));
  assert.ok(supportFileError([{ name: 'file.pdf', type: 'application/pdf', size: 3 * 1024 * 1024 }], true));
  assert.ok(supportFileError([{ name: 'file.pdf', type: 'application/pdf', size: 0 }], true));
  assert.equal(supportBytesMatch(Buffer.from('<script>alert(1)</script>'), 'image/png'), false);
  assert.equal(supportBytesMatch(Buffer.from('%PDF-1.7'), 'application/pdf'), true);
});

test('HTTP routes enforce ownership, guest secrecy, roles, CSRF, attachment privacy and upload limits', async () => {
  const { supabase } = await import('../src/services/db');
  const { config } = await import('../src/config');
  const { getSesClient } = await import('../src/aws');
  const { supportPublicRoutes, supportCustomerRoutes, supportAdminRoutes } =
    await import('../src/modules/support/routes');
  const ses = getSesClient();
  const originals = {
    from: supabase.from,
    rpc: supabase.rpc,
    storage: supabase.storage.from,
    getUser: supabase.auth.getUser,
    send: ses.send,
    environment: config.environment,
    secret: config.turnstile.secretKey,
    sender: config.email.from,
  };
  const ownId = '11111111-1111-4111-8111-111111111111';
  const otherId = '22222222-2222-4222-8222-222222222222';
  let role = 'read_only';
  const messagesSent: any[] = [];
  const rpcCalls: any[] = [];
  const fileId = '44444444-4444-4444-8444-444444444444';
  const rows: Record<string, any[]> = {
    support_settings: [{ id: true, categories: SUPPORT_CATEGORIES, retention_days: 0 }],
    support_tickets: [
      {
        id: ownId,
        user_id: 'customer',
        ticket_number: 1,
        name: 'Asha',
        email: 'asha@example.com',
        subject: 'Customer issue',
        category: 'general',
        status: 'open',
        priority: 'high',
      },
      { id: otherId, user_id: 'another-customer', ticket_number: 2, subject: 'Other customer secret' },
    ],
    support_messages: [],
    support_attachments: [
      {
        id: fileId,
        storage_key: 'private/path',
        file_name: 'private.pdf',
        message: { ticket_id: ownId, is_internal: true },
      },
    ],
    admin_audit_log: [],
    admin_sessions: [
      {
        id: 'session',
        admin_user_id: 'admin',
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
      },
    ],
    admin_users: [{ id: 'admin', status: 'active', must_change_password: false, display_name: 'Admin' }],
  };
  function query(table: string) {
    let selected = table === 'admin_role_assignments' ? [{ role, admin_user_id: 'admin' }] : [...(rows[table] || [])];
    let single = false;
    const builder: any = {
      select: () => builder,
      order: () => builder,
      range: () => builder,
      limit: () => builder,
      eq: (key: string, value: any) => {
        if (table !== 'admin_sessions')
          selected = selected.filter(
            (row) => key.split('.').reduce((item: any, part) => item?.[part], row) === value,
          );
        return builder;
      },
      gt: (key: string, value: any) => {
        selected = selected.filter((row) => row[key] > value);
        return builder;
      },
      is: () => builder,
      maybeSingle: () => {
        single = true;
        return builder;
      },
      single: () => {
        single = true;
        return builder;
      },
      insert: (value: any) => {
        rows[table]?.push(value);
        selected = [value];
        return builder;
      },
      update: (value: any) => {
        selected.forEach((row) => Object.assign(row, value));
        return builder;
      },
      then: (resolve: any, reject: any) =>
        Promise.resolve({
          data: single ? selected[0] || null : selected,
          error: null,
          count: selected.length,
        }).then(resolve, reject),
    };
    return builder;
  }
  (supabase as any).from = query;
  (supabase.auth as any).getUser = async (token: string) => ({
    data: {
      user:
        token === 'customer-token'
          ? { id: 'customer', email: 'asha@example.com', user_metadata: { full_name: 'Asha' } }
          : null,
    },
    error: null,
  });
  (supabase as any).rpc = async (name: string, args: any) => {
    rpcCalls.push({ name, args });
    if (name === 'create_support_ticket') {
      rows.support_tickets.push({
        ...args.p_ticket,
        id: '33333333-3333-4333-8333-333333333333',
        ticket_number: 3,
        status: 'open',
      });
      return { data: '33333333-3333-4333-8333-333333333333', error: null };
    }
    return { data: 'reply', error: null };
  };
  (supabase.storage as any).from = () => ({
    createSignedUrl: async () => ({
      data: { signedUrl: 'https://example.com/private-download' },
      error: null,
    }),
  });
  ses.send = (async (command: any) => {
    messagesSent.push(command.input);
    return { MessageId: 'test-message' };
  }) as any;
  config.environment = 'development';
  config.turnstile.secretKey = '';
  config.email.from = 'sender@example.com';
  const app = express();
  app.use(express.json());
  app.use('/public', supportPublicRoutes);
  app.use('/customer', supportCustomerRoutes);
  app.use('/admin', supportAdminRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const customer = { Authorization: 'Bearer customer-token' };
  const admin = {
    Cookie: 'admin_session=test',
    Origin: config.admin.origins[0],
    'Content-Type': 'application/json',
  };
  try {
    assert.equal((await fetch(`${base}/customer/${ownId}`)).status, 401);
    assert.equal((await fetch(`${base}/customer/${otherId}`, { headers: customer })).status, 404);
    const own = (await (await fetch(`${base}/customer/${ownId}`, { headers: customer })).json()) as any;
    assert.equal(own.ticket.subject, 'Customer issue');
    assert.equal(own.ticket.priority, undefined);
    assert.equal(
      (await fetch(`${base}/customer/${ownId}/attachments/${fileId}`, { headers: customer })).status,
      404,
    );
    rows.support_attachments[0].message.is_internal = false;
    assert.equal(
      (await fetch(`${base}/customer/${ownId}/attachments/${fileId}`, { headers: customer })).status,
      200,
    );
    assert.equal(
      (await fetch(`${base}/customer/${otherId}/attachments/${fileId}`, { headers: customer })).status,
      404,
    );
    await fetch(`${base}/customer/${ownId}/messages`, {
      method: 'POST',
      headers: { ...customer, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Customer reply', isInternal: true }),
    });
    assert.equal(rpcCalls.at(-1).args.p_internal, false, 'customers cannot submit hidden internal notes');
    assert.equal(
      (await fetch(`${base}/public/ticket`, { headers: { 'X-Support-Token': 'forged' } })).status,
      404,
    );
    assert.equal((await fetch(`${base}/admin/${ownId}`)).status, 401);
    assert.equal(
      (
        await fetch(`${base}/admin/${ownId}`, {
          method: 'PATCH',
          headers: { Cookie: admin.Cookie, 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(`${base}/admin/${ownId}`, { method: 'PATCH', headers: admin, body: '{}' })).status,
      403,
    );
    role = 'support';
    assert.equal(
      (await fetch(`${base}/admin/settings`, { method: 'PUT', headers: admin, body: '{}' })).status,
      403,
    );
    const forged = new FormData();
    forged.set('files', new Blob(['<script>bad</script>'], { type: 'image/png' }), 'forged.png');
    assert.equal(
      (await fetch(`${base}/customer`, { method: 'POST', headers: customer, body: forged })).status,
      400,
    );
    const large = new FormData();
    large.set(
      'files',
      new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'application/pdf' }),
      'large.pdf',
    );
    assert.equal(
      (await fetch(`${base}/customer`, { method: 'POST', headers: customer, body: large })).status,
      400,
    );
    // A public submission cannot attach itself to a matching customer account or set priority.
    const guest = {
      name: 'Guest-controlled name',
      email: 'victim@example.com',
      phone: '+919876542310',
      subject: 'Untrusted subject',
      category: 'general',
      description: 'Untrusted description supplied by guest.',
      user_id: 'customer',
      priority: 'critical',
      ref_code_x7: '',
      formElapsedMs: 8000,
    };
    assert.equal(
      (
        await fetch(`${base}/public`, {
          method: 'POST',
          headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
          body: JSON.stringify(guest),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/public`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...guest, formElapsedMs: 1 }),
        })
      ).status,
      400,
    );
    const created = await fetch(`${base}/public`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(guest),
    });
    assert.equal(created.status, 201);
    const response = (await created.json()) as any;
    assert.ok(response.ticketNumber);
    assert.equal(response.ticket, undefined);
    const stored = rows.support_tickets.at(-1)!;
    assert.equal(stored.user_id, null);
    assert.equal(stored.priority, 'low');
    assert.match(stored.guest_token_hash, /^[0-9a-f]{64}$/);
    const mail = messagesSent.find((input) => input.Destination.ToAddresses.includes('victim@example.com'));
    assert.ok(mail);
    const text = mail.Content.Simple.Body.Text.Data;
    assert.ok(text.includes('/contact-support/ticket#token='));
    for (const untrusted of [guest.name, guest.subject, guest.description])
      assert.ok(!text.includes(untrusted));
    assert.ok(!JSON.stringify(response).includes('token'));
    const guestToken = text.match(/#token=([A-Za-z0-9_-]{43})/)[1];
    const details = await fetch(`${base}/public/ticket`, { headers: { 'X-Support-Token': guestToken } });
    assert.equal(details.status, 200);
    stored.guest_expires_at = new Date(Date.now() - 1000).toISOString();
    assert.equal(
      (await fetch(`${base}/public/ticket`, { headers: { 'X-Support-Token': guestToken } })).status,
      404,
    );
    // Customer text cannot become a hidden note; admin notes do not send customer mail.
    const sentBeforeNote = messagesSent.length;
    const note = await fetch(`${base}/admin/${ownId}/messages`, {
      method: 'POST', headers: admin, body: JSON.stringify({ body: 'For support staff only', isInternal: true }),
    });
    assert.equal(note.status, 200);
    assert.equal(rpcCalls.at(-1).args.p_internal, true);
    assert.equal(messagesSent.length, sentBeforeNote);
    // The same unverified address can receive at most three confirmations per hour.
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal((await fetch(`${base}/public`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(guest) })).status, 201);
    }
    assert.equal((await fetch(`${base}/public`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(guest) })).status, 429);
  } finally {
    supabase.from = originals.from;
    supabase.rpc = originals.rpc;
    supabase.storage.from = originals.storage;
    supabase.auth.getUser = originals.getUser;
    ses.send = originals.send;
    config.environment = originals.environment;
    config.turnstile.secretKey = originals.secret;
    config.email.from = originals.sender;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
