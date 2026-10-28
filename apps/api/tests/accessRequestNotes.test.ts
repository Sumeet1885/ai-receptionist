import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

test('request notes append with server authorship and enforce session, role, origin and length', async () => {
  const { supabase } = await import('../src/services/db');
  const { config } = await import('../src/config');
  const { default: routes } = await import('../src/modules/access-requests/admin.routes');
  const originalFrom = supabase.from;
  const requestId = '11111111-1111-4111-8111-111111111111';
  let role = 'support';
  const saved: any[] = [];
  (supabase as any).from = (table: string) => {
    let single = false;
    let data: any[] =
      table === 'access_requests'
        ? [{ id: requestId, status: 'contacted', provisioned_user_id: null, admin_notes: 'Old note' }]
        : table === 'access_request_notes'
          ? [...saved]
          : table === 'admin_sessions'
            ? [
                {
                  id: 'session',
                  admin_user_id: 'admin',
                  revoked_at: null,
                  last_seen_at: new Date().toISOString(),
                  expires_at: new Date(Date.now() + 3600000).toISOString(),
                },
              ]
            : table === 'admin_users'
              ? [{ id: 'admin', display_name: 'Actual Admin', status: 'active', must_change_password: false }]
              : table === 'admin_role_assignments'
                ? [{ admin_user_id: 'admin', role }]
                : [];
    const q: any = {
      select: () => q,
      is: () => q,
      order: () => q,
      eq: (key: string, value: any) => {
        if (table !== 'admin_sessions') data = data.filter((row) => row[key] === value);
        return q;
      },
      maybeSingle: () => {
        single = true;
        return q;
      },
      single: () => {
        single = true;
        return q;
      },
      insert: (row: any) => {
        const value = {
          ...row,
          id: `note-${saved.length + 1}`,
          created_at: new Date().toISOString(),
          is_imported: false,
        };
        if (table === 'access_request_notes') saved.push(value);
        data = [value];
        return q;
      },
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: single ? data[0] || null : data, error: null }).then(resolve, reject),
    };
    return q;
  };
  const app = express();
  app.use(express.json());
  app.use('/requests', routes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/requests/${requestId}`;
  const headers = {
    Cookie: 'admin_session=test',
    Origin: config.admin.origins[0],
    'Content-Type': 'application/json',
  };
  const add = (body: any, customHeaders: Record<string, string> = headers) =>
    fetch(`${url}/notes`, { method: 'POST', headers: customHeaders, body: JSON.stringify(body) });
  try {
    assert.equal(
      (await add({ body: 'note' }, { Origin: headers.Origin, 'Content-Type': 'application/json' })).status,
      401,
    );
    assert.equal((await add({ body: 'note' }, { ...headers, Origin: 'https://other.example' })).status, 403);
    role = 'read_only';
    assert.equal((await add({ body: 'note' })).status, 403);
    assert.equal((await fetch(url, { headers })).status, 200, 'read-only admins can read the history');
    role = 'support';
    assert.equal((await add({ body: '   ' })).status, 400);
    assert.equal((await add({ body: 'x'.repeat(2001) })).status, 400);
    const first = await add({
      body: ' First conversation ',
      author_name: 'Forged Admin',
      created_at: '2000-01-01',
    });
    assert.equal(first.status, 201);
    assert.equal(saved[0].body, 'First conversation');
    assert.equal(saved[0].author_name, 'Actual Admin');
    assert.equal(saved[0].author_admin_id, 'admin');
    assert.notEqual(saved[0].created_at, '2000-01-01');
    assert.equal((await add({ body: 'Second conversation' })).status, 201);
    assert.equal(saved.length, 2);
    assert.equal(saved[0].body, 'First conversation');
    const details = (await (await fetch(url, { headers })).json()) as any;
    assert.equal(details.notes.length, 2);
    assert.equal(
      (await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ adminNotes: 'overwrite' }) }))
        .status,
      400,
    );
  } finally {
    (supabase as any).from = originalFrom;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
