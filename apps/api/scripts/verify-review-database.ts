/** Review validation against the connected database; all changes are rolled back. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

async function main() {
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 10_000 });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='30s'");
    const exists = await db.query("SELECT to_regprocedure('public.admin_revenue_summary()') AS fn");
    if (!exists.rows[0].fn) await db.query(readFileSync(resolve('../../supabase/migrations/20261029100000_admin_revenue_summary.sql'), 'utf8'));
    const summary = (await db.query('SELECT public.admin_revenue_summary() AS value')).rows[0].value;
    const totals = (await db.query("SELECT count(*)::integer AS count,coalesce(sum(total) FILTER(WHERE currency='INR'),0)::bigint AS inr,coalesce(sum(total) FILTER(WHERE currency='USD'),0)::bigint AS usd FROM public.billing_orders WHERE status IN ('paid','provisioned','review') AND paid_at IS NOT NULL")).rows[0];
    assert.equal(summary.counts.allTime, totals.count);
    assert.equal(summary.totals.allTime.INR, Number(totals.inr));
    assert.equal(summary.totals.allTime.USD, Number(totals.usd));
    assert.equal(summary.monthly.length, 6);
    assert.ok(summary.byPlan.length <= 20);
    const permissions = (await db.query("SELECT has_function_privilege('anon','public.admin_revenue_summary()','EXECUTE') AS anon,has_function_privilege('authenticated','public.admin_revenue_summary()','EXECUTE') AS customer,has_function_privilege('service_role','public.admin_revenue_summary()','EXECUTE') AS service")).rows[0];
    assert.deepEqual(permissions, { anon: false, customer: false, service: true });

    // Test the reviewer's proposed forced inlining against the actual count-and-page query.
    const fn = (await db.query("SELECT pg_get_functiondef('public.admin_customer_page(integer,integer,text,text,uuid)'::regprocedure) AS definition")).rows[0].definition;
    await db.query(fn.replace('public.admin_customer_page', 'pg_temp.review_customer_page').replaceAll('AS MATERIALIZED', 'AS NOT MATERIALIZED'));
    const original = (await db.query("SELECT public.admin_customer_page(1,25,NULL,'') AS value")).rows[0].value;
    const alternative = (await db.query("SELECT pg_temp.review_customer_page(1,25,NULL,'') AS value")).rows[0].value;
    assert.deepEqual(original, alternative);
    const times: Record<string, number[]> = { materialized: [], inlined: [] };
    for (let n = 0; n < 5; n++) for (const [name, fnName] of [['materialized', 'public.admin_customer_page'], ['inlined', 'pg_temp.review_customer_page']]) {
      const plan = (await db.query(`EXPLAIN (ANALYZE,FORMAT JSON) SELECT ${fnName}(1,25,NULL,'')`)).rows[0]['QUERY PLAN'][0];
      times[name].push(plan['Execution Time']);
    }
    console.log(JSON.stringify({ revenueChecksPassed: true, customerQueryEquivalent: true,
      customerCount: original.total,
      customerPageMeanMs: Object.fromEntries(Object.entries(times).map(([name, values]) => [name, Number((values.slice(1).reduce((a,b) => a+b,0)/4).toFixed(3))])),
      allChangesRolledBack: true }));
  } finally { await db.query('ROLLBACK').catch(() => undefined); await db.end(); }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
