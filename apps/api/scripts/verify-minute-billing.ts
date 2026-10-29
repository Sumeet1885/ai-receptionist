/** Database integration check. All schema changes and fixtures are rolled back, even on success. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

async function main() {
  if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required for the rollback-only integration check.');
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 10_000 });
  await db.connect();
  let checks = 0;
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s'");
    const existing = await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='billing_orders' AND column_name='purchase_kind'");
    if (!existing.rowCount) await db.query(readFileSync(resolve('../../supabase/migrations/20261029090000_workspace_minute_purchases.sql'), 'utf8'));
    const user = randomUUID(), plan = randomUUID(), bot = randomUUID();
    await db.query("INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,now(),'{}')", [user, `${user}@example.invalid`]);
    await db.query("INSERT INTO public.plans(id,slug,name,monthly_minutes,price_inr,feature_values) VALUES($1,$2,'Rollback-only minute test',1000,799000,'{\"topup_500_minutes\":\"4000\"}')", [plan, `minute-check-${plan}`]);
    await db.query("INSERT INTO public.customer_accounts(user_id,plan_id,plan_started_at,access_expires_at,current_period_end,plan_currency,password_set_at,onboarding_completed_at) VALUES($1,$2,now()-interval '7 days',now()+interval '23 days',now()+interval '23 days','INR',now(),now()) ON CONFLICT(user_id) DO UPDATE SET plan_id=$2,plan_started_at=now()-interval '7 days',access_expires_at=now()+interval '23 days',current_period_end=now()+interval '23 days',plan_currency='INR',password_set_at=now(),onboarding_completed_at=now()", [user, plan]);
    await db.query("INSERT INTO public.bots(id,owner_id,business_name,industry,subdomain,greeting,knowledge_base) VALUES($1,$2,'Minute test','Other',$3,'Hello','Test')", [bot, user, `minute-check-${bot}`]);
    const usage = async () => (await db.query('SELECT public.workspace_minute_summary($1) AS value', [user])).rows[0].value;
    assert.equal((await usage()).remainingMinutes, 1000, 'new workspace allowance'); checks++;
    const call = randomUUID();
    await db.query("INSERT INTO public.phone_calls(id,bot_id,dograh_run_id,started_at,duration_seconds) VALUES($1,$2,$3,now()-interval '1 hour',60000)", [call, bot, `rollback-${call}`]);
    assert.equal((await usage()).remainingMinutes, 0); checks++;
    await db.query('UPDATE public.phone_calls SET duration_seconds=60000 WHERE id=$1', [call]);
    assert.equal((await usage()).usedMinutes, 1000); checks++;
    await db.query("UPDATE public.phone_calls SET started_at=now()-interval '2 months' WHERE id=$1", [call]);
    assert.equal((await usage()).usedMinutes, 0); checks++;
    await db.query("UPDATE public.phone_calls SET started_at=now()-interval '1 hour' WHERE id=$1", [call]);
    assert.equal((await usage()).usedMinutes, 1000); checks++;
    // A call before this monthly period cannot consume this month's allowance.
    await db.query("INSERT INTO public.phone_calls(bot_id,dograh_run_id,started_at,duration_seconds) VALUES($1,$2,now()-interval '2 months',600)", [bot, randomUUID()]);
    assert.equal((await usage()).usedMinutes, 1000); checks++;
    async function paidOrder(kind: string, minutes: number | null, target = true) {
      const id = randomUUID();
      await db.query("INSERT INTO public.billing_orders(id,customer_user_id,plan_id,plan_snapshot,currency,plan_amount,setup_fee,total,full_name,email,phone,business_name,status,purchase_kind,minutes_added,target_period_start,target_period_end,paid_at) SELECT $1,$2,p.id,to_jsonb(p),'INR',400000,0,400000,'Rollback test',$3,'','Rollback test','paid',$4,$5,CASE WHEN $6 THEN a.plan_started_at END,CASE WHEN $4='topup' THEN a.access_expires_at END,now() FROM public.plans p JOIN public.customer_accounts a ON a.user_id=$2 WHERE p.id=$7", [id, user, `${user}@example.invalid`, kind, minutes, target, plan]);
      return id;
    }
    const topup = await paidOrder('topup', 500);
    await db.query('SELECT public.activate_workspace_payment($1)', [topup]);
    const credited = await usage();
    assert.equal(credited.remainingMinutes, 500); checks++;
    await db.query('SELECT public.activate_workspace_payment($1)', [topup]);
    assert.equal((await usage()).topupMinutes, 500); checks++;
    const changed = await paidOrder('plan_change', null);
    await db.query('SELECT public.activate_workspace_payment($1)', [changed]);
    const fresh = await usage();
    assert.equal(fresh.topupMinutes, 0); assert.equal(fresh.usedMinutes, 0); assert.equal(fresh.remainingMinutes, 1000); checks++;
    assert.ok(Date.parse(fresh.expiresAt) > Date.now() + 27 * 86400000); checks++;
    assert.equal(new Date(Date.parse(fresh.expiresAt) - 1).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata' }), '23:59:59'); checks++;
    await db.query('SELECT public.activate_workspace_payment($1)', [changed]);
    assert.equal((await usage()).startsAt, fresh.startsAt); checks++;
    const late = await paidOrder('topup', 500);
    await db.query("UPDATE public.customer_accounts SET plan_started_at=clock_timestamp()+interval '1 second' WHERE user_id=$1", [user]);
    await db.query('SELECT public.activate_workspace_payment($1)', [late]);
    assert.equal((await db.query('SELECT status FROM public.billing_orders WHERE id=$1', [late])).rows[0].status, 'review'); checks++;
    const pulses = (await db.query('SELECT public.call_billed_seconds(0) AS zero,public.call_billed_seconds(24) AS short,public.call_billed_seconds(25) AS one,public.call_billed_seconds(61) AS two')).rows[0];
    assert.deepEqual(pulses, { zero: '0', short: '30', one: '60', two: '120' }); checks++;
    const permissions = (await db.query("SELECT has_table_privilege('authenticated','public.workspace_minute_credits','INSERT') AS write_credits,has_table_privilege('authenticated','public.workspace_call_usage','UPDATE') AS alter_usage,has_function_privilege('authenticated','public.activate_workspace_payment(uuid)','EXECUTE') AS activate,has_function_privilege('anon','public.workspace_minute_summary(uuid)','EXECUTE') AS public_balance")).rows[0];
    assert.deepEqual(permissions, { write_credits: false, alter_usage: false, activate: false, public_balance: false }); checks++;
    console.log(JSON.stringify({ passed: checks, allChangesRolledBack: true, emailsSent: 0, paymentsMade: 0 }));
  } finally { await db.query('ROLLBACK').catch(() => undefined); await db.end(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Minute integration check failed'); process.exitCode = 1; });
