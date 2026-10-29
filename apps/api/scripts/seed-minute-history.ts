/** Explicit development fixtures for viewing top-up and active-plan-change history. No provider calls or email. */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import { repairMinuteFixtureAuth } from './minute-fixture-auth';

const email = 'bolega-minute-history-demo@yopmail.com';
const tag = 'minute-history-demo-v1';
async function main() {
  if ((process.env.DEPLOY_ENV || 'development') !== 'development') throw new Error('This fixture is development-only.');
  if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required.');
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 10_000 });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'");
    const existing = (await db.query('SELECT id,raw_user_meta_data FROM auth.users WHERE email=$1', [email])).rows[0];
    if (existing && (existing.raw_user_meta_data?.fixture_tag !== tag || existing.raw_user_meta_data?.is_dummy !== true)) throw new Error('Fixture email belongs to a different account; refusing to modify it.');
    if (existing) {
      await repairMinuteFixtureAuth(db, existing.id);
      const saved = await db.query("SELECT purchase_kind,status,minutes_added FROM public.billing_orders WHERE customer_user_id=$1 AND plan_snapshot->>'fixture_tag'=$2 ORDER BY created_at", [existing.id, tag]);
      assert.equal(saved.rowCount, 2, 'Existing fixtures must be complete; do not seed partial records.');
      await db.query('COMMIT');
      console.log(JSON.stringify({ alreadySeeded: true, email, purchases: saved.rows })); return;
    }
    const plans = (await db.query("SELECT * FROM public.plans WHERE is_active AND NOT is_trial AND NOT contact_sales AND price_inr>0 AND monthly_minutes>0 ORDER BY (slug IN ('ai-starter','ai-growth')) DESC,sort_order,id LIMIT 2")).rows;
    assert.equal(plans.length, 2, 'Two paid plans are required.');
    const [starter, next] = plans;
    const user = randomUUID(), bot = randomUUID();
    await db.query("INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,now(),$3)", [user, email, JSON.stringify({ full_name: '[DUMMY] Minute purchase tester', business_name: '[DUMMY] Top-up and plan-switch demo', is_dummy: true, fixture_tag: tag })]);
    await repairMinuteFixtureAuth(db, user);
    await db.query("INSERT INTO public.customer_accounts(user_id,plan_id,plan_started_at,access_expires_at,current_period_end,plan_currency,password_set_at,onboarding_completed_at) VALUES($1,$2,now()-interval '7 days',now()+interval '23 days',now()+interval '23 days','INR',now(),now()) ON CONFLICT(user_id) DO UPDATE SET plan_id=$2,plan_started_at=now()-interval '7 days',access_expires_at=now()+interval '23 days',current_period_end=now()+interval '23 days',plan_currency='INR',password_set_at=now(),onboarding_completed_at=now()", [user, starter.id]);
    await db.query("INSERT INTO public.bots(id,owner_id,business_name,industry,subdomain,greeting,knowledge_base,is_active) VALUES($1,$2,'[DUMMY] Minute purchase history','Other',$3,'Demo only','Simulated usage for billing tests',false)", [bot, user, `minute-history-${bot}`]);
    await db.query("INSERT INTO public.phone_calls(bot_id,dograh_run_id,started_at,duration_seconds,status) VALUES($1,$2,now()-interval '1 hour',$3,'completed')", [bot, `dummy-${tag}-${bot}`, starter.monthly_minutes * 60]);
    const summary = async () => (await db.query('SELECT public.workspace_minute_summary($1) AS value', [user])).rows[0].value;
    assert.equal((await summary()).remainingMinutes, 0);
    const topup = randomUUID();
    await db.query("INSERT INTO public.billing_orders(id,customer_user_id,plan_id,plan_snapshot,currency,plan_amount,setup_fee,total,full_name,email,phone,business_name,status,purchase_kind,minutes_added,target_period_start,target_period_end,paid_at) SELECT $1,$2,$3,$4,'INR',400000,0,400000,'[DUMMY] Minute purchase tester',$5,'','[DUMMY] Top-up and plan-switch demo','paid','topup',500,a.plan_started_at,a.access_expires_at,now() FROM public.customer_accounts a WHERE user_id=$2", [topup, user, starter.id, JSON.stringify({ ...starter, name: `[DUMMY] ${starter.name} — simulated top-up`, is_dummy: true, fixture_tag: tag }), email]);
    await db.query('SELECT public.activate_workspace_payment($1)', [topup]);
    assert.equal((await summary()).remainingMinutes, 500);
    const change = randomUUID();
    await db.query("INSERT INTO public.billing_orders(id,customer_user_id,plan_id,plan_snapshot,currency,plan_amount,setup_fee,total,full_name,email,phone,business_name,status,purchase_kind,target_period_start,paid_at) SELECT $1,$2,$3,$4,'INR',$5,0,$5,'[DUMMY] Minute purchase tester',$6,'','[DUMMY] Top-up and plan-switch demo','paid','plan_change',a.plan_started_at,now() FROM public.customer_accounts a WHERE user_id=$2", [change, user, next.id, JSON.stringify({ ...next, name: `[DUMMY] ${next.name} — simulated plan change`, is_dummy: true, fixture_tag: tag }), next.price_inr, email]);
    await db.query('SELECT public.activate_workspace_payment($1)', [change]);
    const fresh = await summary();
    assert.equal(fresh.planId, next.id); assert.equal(fresh.usedMinutes, 0); assert.equal(fresh.topupMinutes, 0); assert.equal(fresh.remainingMinutes, next.monthly_minutes);
    const history = (await db.query('SELECT purchase_kind,status,minutes_added FROM public.billing_orders WHERE customer_user_id=$1 ORDER BY created_at,id', [user])).rows;
    assert.ok(history.every(row => row.status === 'provisioned'));
    await db.query('COMMIT');
    console.log(JSON.stringify({ saved: true, email, purchases: history, activePlanChanged: true, remainingMinutes: fresh.remainingMinutes, emailsSent: 0, paymentsMade: 0 }));
  } catch (error) { await db.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { await db.end(); }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
