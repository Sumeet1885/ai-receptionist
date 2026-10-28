import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

test('auth middleware distinguishes rejected credentials from verification outages', async () => {
  const { supabase } = await import('../src/services/db');
  const { requireAuth } = await import('../src/middleware/auth');
  const original = supabase.auth.getUser;
  try {
    for (const [error, expected] of [[{ status: 401, code: 'bad_jwt' }, 401], [{ status: 403, code: 'user_banned' }, 401], [{ status: 503 }, 503], [{ status: 429 }, 503], [{ status: 0, name: 'AuthRetryableFetchError' }, 503]] as const) {
      (supabase.auth as any).getUser = async () => ({ data: { user: null }, error });
      let status = 0; let body: any;
      const res: any = { status: (value: number) => { status = value; return res; }, json: (value: any) => { body = value; } };
      await requireAuth({ headers: { authorization: 'Bearer test' } } as any, res, () => assert.fail('Access must stay blocked'));
      assert.equal(status, expected); assert.equal(body.code, expected === 401 ? 'invalid_token' : 'auth_unavailable');
    }
  } finally { supabase.auth.getUser = original; }
});
