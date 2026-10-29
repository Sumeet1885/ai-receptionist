import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

test('admin list repositories request database pages, preserve counts and resolve labels beyond the current plan page', async () => {
  const { supabase } = await import('../src/services/db');
  const { listCustomers, getCustomer } = await import('../src/modules/customers/repository');
  const { listAdminPlans, listAdminCoupons } = await import('../src/modules/billing/repository');
  const originalRpc = supabase.rpc;
  const originalFrom = supabase.from;
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const rpcCalls: Array<{ name: string; args: any }> = [];
  (supabase as any).rpc = async (name: string, args: any) => {
    rpcCalls.push({ name, args });
    return {
      data: { rows: [{ userId: args.p_user || 'paged-customer' }], total: 51, counts: { all: 51 } },
      error: null,
    };
  };
  (supabase as any).from = (table: string) => {
    let labels = false;
    const builder: any = {};
    for (const method of ['select', 'eq', 'order', 'range', 'or', 'in']) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        if (method === 'in') labels = true;
        return builder;
      };
    }
    builder.then = (resolve: any, reject: any) =>
      Promise.resolve({
        data:
          table === 'coupons'
            ? [{ id: 'coupon-26', plan_ids: ['plan-from-page-99'] }]
            : labels
              ? [{ id: 'plan-from-page-99', name: 'Correct off-page plan name' }]
              : [{ id: 'plan-26' }],
        count: 67,
        error: null,
      }).then(resolve, reject);
    return builder;
  };
  try {
    const customers = await listCustomers({ page: 2, pageSize: 25, stage: 'active', search: 'clinic' });
    assert.equal(customers.total, 51);
    assert.deepEqual(rpcCalls[0], {
      name: 'admin_customer_page',
      args: { p_page: 2, p_size: 25, p_stage: 'active', p_search: 'clinic', p_user: null },
    });
    assert.equal(calls.length, 0, 'Customer pages must not fetch all auth users, accounts or bots');
    assert.equal((await getCustomer('exact-user'))?.userId, 'exact-user');
    assert.equal(rpcCalls[1].args.p_user, 'exact-user');
    assert.equal(rpcCalls[1].args.p_size, 1);
    const plans = await listAdminPlans({ page: 2, activeOnly: true, trialOnly: true, search: 'trial' });
    assert.equal(plans.total, 67);
    assert.ok(
      calls.some(
        (call) =>
          call.table === 'plans' && call.method === 'range' && call.args[0] === 25 && call.args[1] === 49,
      ),
    );
    assert.ok(
      calls.some((call) => call.method === 'eq' && call.args[0] === 'is_active' && call.args[1] === true),
    );
    assert.ok(
      calls.some((call) => call.method === 'eq' && call.args[0] === 'is_trial' && call.args[1] === true),
    );
    assert.ok(
      calls.some((call) => call.method === 'order' && call.args[0] === 'id'),
      'Stable page ordering needs a unique tie-breaker',
    );
    const coupons = await listAdminCoupons(3);
    assert.equal(coupons.total, 67);
    assert.equal(coupons.planNames['plan-from-page-99'], 'Correct off-page plan name');
    assert.ok(
      calls.some(
        (call) =>
          call.table === 'coupons' && call.method === 'range' && call.args[0] === 50 && call.args[1] === 74,
      ),
    );
    assert.ok(calls.some((call) => call.table === 'plans' && call.method === 'in' && call.args[0] === 'id'));
  } finally {
    (supabase as any).rpc = originalRpc;
    (supabase as any).from = originalFrom;
  }
});
