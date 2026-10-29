/** Explicitly invoked test fixtures; never runs during migration, startup or deployment. */
import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { supabase } from '../src/services/db';
import { projectRef, requireConfirmedProject } from './admin-cli';

const { values } = parseArgs({
  options: {
    'confirm-project': { type: 'string' },
    batch: { type: 'string' },
    cleanup: { type: 'boolean', default: false },
  },
});
requireConfirmedProject(values['confirm-project']);
const batch =
  values.batch ||
  `biqa-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(2).toString('hex')}`;
if (!/^biqa-\d{8}-[a-f0-9]{4}$/.test(batch)) throw new Error('Invalid batch name.');
const directory = resolve('.test-data');
mkdirSync(directory, { recursive: true });
const file = resolve(directory, `${batch}.json`);
type Fixture = { id: string; email: string; userId?: string };
interface Manifest {
  project: string;
  batch: string;
  complete: boolean;
  cleaned?: boolean;
  customers: Fixture[];
  requests: Fixture[];
  tickets: Fixture[];
  leads: Fixture[];
  payments: Fixture[];
  plans: Fixture[];
  coupons: Fixture[];
}
const fixtures = (kind: string): Fixture[] =>
  Array.from({ length: 50 }, (_, index) => ({
    id: randomUUID(),
    email: `${batch}-${kind}-${String(index + 1).padStart(3, '0')}@yopmail.com`,
  }));
const manifest: Manifest = existsSync(file)
  ? JSON.parse(readFileSync(file, 'utf8'))
  : {
      project: projectRef(),
      batch,
      complete: false,
      customers: fixtures('customer'),
      requests: fixtures('request'),
      tickets: fixtures('support'),
      leads: fixtures('lead'),
      payments: fixtures('payment'),
      plans: fixtures('plan'),
      coupons: fixtures('coupon'),
    };
if (manifest.project !== projectRef() || manifest.batch !== batch)
  throw new Error('Manifest project/batch mismatch.');
const save = () => writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
const stamp = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const name = (kind: string, index: number) =>
  `[DUMMY ${batch}] ${kind} ${String(index + 1).padStart(3, '0')}`;

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error('SUPABASE_DB_URL is required.');
  const connection = new URL(connectionString);
  if (!`${connection.hostname}/${decodeURIComponent(connection.username)}`.includes(projectRef()))
    throw new Error('Database URL does not match the confirmed Supabase project.');
  const db = new pg.Client({ connectionString, connectionTimeoutMillis: 15_000 });
  await db.connect();
  try {
    if (values.cleanup) {
      if (!existsSync(file)) throw new Error('Cleanup requires an existing manifest.');
      // Verify these are still dummy users before deleting anything.
      for (const customer of manifest.customers.filter((item) => item.userId)) {
        const { data, error } = await supabase.auth.admin.getUserById(customer.userId!);
        if (data.user && data.user.user_metadata?.test_batch !== batch)
          throw new Error('Refusing to remove an account without the batch marker.');
        if (error && error.status !== 404) throw error;
      }
      await db.query('BEGIN');
      try {
        const remove = (table: string, key: string, ids: string[]) =>
          db.query(`DELETE FROM public.${table} WHERE ${key}=ANY($1::uuid[])`, [ids]);
        await remove(
          'billing_orders',
          'id',
          [...manifest.leads, ...manifest.payments].map((item) => item.id),
        );
        await remove(
          'support_tickets',
          'id',
          manifest.tickets.map((item) => item.id),
        );
        await remove(
          'customer_accounts',
          'user_id',
          manifest.customers.flatMap((item) => (item.userId ? [item.userId] : [])),
        );
        await remove(
          'access_requests',
          'id',
          manifest.requests.map((item) => item.id),
        );
        await remove(
          'coupons',
          'id',
          manifest.coupons.map((item) => item.id),
        );
        await remove(
          'plans',
          'id',
          manifest.plans.map((item) => item.id),
        );
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
      for (const customer of manifest.customers.filter((item) => item.userId)) {
        const { error } = await supabase.auth.admin.deleteUser(customer.userId!);
        if (error && error.status !== 404) throw error;
      }
      manifest.cleaned = true;
      save();
      console.log(`Removed batch ${batch}.`);
      return;
    }
    if (manifest.complete || manifest.cleaned)
      throw new Error('This batch is already complete or cleaned. Use a new batch name.');
    save();
    const trial = (
      await db.query("SELECT id FROM public.plans WHERE slug='trial-period' AND is_trial AND is_active")
    ).rows[0];
    if (!trial) throw new Error('The default Trial Period plan must be active.');
    const existing = (
      await db.query("SELECT id,email FROM auth.users WHERE raw_user_meta_data->>'test_batch'=$1", [batch])
    ).rows;
    for (const item of manifest.customers)
      item.userId ||= existing.find((user) => user.email === item.email)?.id;
    let next = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (next < manifest.customers.length) {
          const index = next++;
          const item = manifest.customers[index];
          if (item.userId) continue;
          const { data, error } = await supabase.auth.admin.createUser({
            email: item.email,
            email_confirm: index >= 10,
            password: randomBytes(32).toString('base64url'),
            user_metadata: {
              full_name: name('Customer', index),
              business_name: name('Business', index),
              test_batch: batch,
              is_dummy: true,
            },
          });
          if (error || !data.user)
            throw new Error(`Create dummy customer ${index + 1}: ${error?.message || 'no user'}`);
          item.userId = data.user.id;
          save();
          console.log(`Dummy customer ${index + 1}/50 ready`);
        }
      }),
    );
    // All application records commit together. No email function, Razorpay call, bot or campaign is invoked.
    await db.query('BEGIN');
    try {
      for (let i = 0; i < 50; i++) {
        const row = manifest.plans[i];
        const trialPlan = i % 5 === 0;
        await db.query(
          `INSERT INTO public.plans(id,slug,name,tagline,sort_order,is_active,is_trial,trial_days,monthly_minutes,price_inr,price_usd,setup_fee_inr,max_agents,max_concurrent_calls,feature_values)
          VALUES($1,$2,$3,$4,$5,false,$6,$7,$8,$9,$10,$11,$12,$12,$13)`,
          [
            row.id,
            `${batch}-plan-${i + 1}`,
            name(trialPlan ? 'Trial plan' : 'Plan', i),
            'Dummy pagination test. Inactive; not public.',
            1000 + i,
            trialPlan,
            trialPlan ? 7 + i : null,
            (i + 1) * 100,
            trialPlan ? 0 : (i + 1) * 100000,
            trialPlan ? 0 : (i + 1) * 1000,
            trialPlan ? 0 : 50000,
            1 + (i % 5),
            JSON.stringify({ calendar_booking: String(i % 5), telephony: '500' }),
          ],
        );
        const coupon = manifest.coupons[i];
        await db.query(
          `INSERT INTO public.coupons(id,code,description,discount_type,percent_off,amount_off_inr,applies_to,max_redemptions,is_active)
          VALUES($1,$2,$3,$4,$5,$6,$7,50,false)`,
          [
            coupon.id,
            `${batch.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
            name('Coupon', i),
            i % 2 ? 'fixed' : 'percent',
            i % 2 ? null : 5 + (i % 40),
            i % 2 ? 10000 : null,
            ['total', 'plan', 'setup'][i % 3],
          ],
        );
      }
      for (let i = 0; i < 50; i++) {
        const row = manifest.requests[i];
        const approved = i >= 35 && i < 45;
        const status = i < 25 ? 'pending' : i < 35 ? 'contacted' : approved ? 'approved' : 'rejected';
        await db.query(
          `INSERT INTO public.access_requests(id,status,full_name,email,phone,business_name,industry,city,languages,use_case,monthly_volume,provisioned_user_id,provisioned_at,trial_plan_id,created_at,updated_at)
          VALUES($1,$2,$3,$4,'',$5,$6,$7,$8,$9,'under_100',$10,$11,$12,$13,$14)`,
          [
            row.id,
            status,
            name('Requester', i),
            approved ? manifest.customers[i - 35].email : row.email,
            name('Business request', i),
            ['Healthcare', 'Real estate', 'Hospitality', 'Automotive'][i % 4],
            ['Pune', 'Mumbai', 'Chennai', 'Bengaluru'][i % 4],
            [['Hindi', 'Marathi'], ['Tamil'], ['Telugu'], ['Gujarati']][i % 4],
            'Dummy record for pagination, email and admin workflow testing.',
            approved ? manifest.customers[i - 35].userId : null,
            approved ? stamp(i) : null,
            approved ? trial.id : null,
            stamp(i + 1),
            stamp(i / 2),
          ],
        );
        for (let n = 0; n < 2; n++)
          await db.query(
            `INSERT INTO public.access_request_notes(access_request_id,author_name,body,created_at) VALUES($1,'Dummy test administrator',$2,$3)`,
            [row.id, `Dummy follow-up ${n + 1}: pagination and IST timestamp testing.`, stamp(i + n + 1)],
          );
      }
      for (let i = 0; i < 50; i++) {
        const user = manifest.customers[i];
        await db.query('SELECT public.assign_workspace_trial($1,$2,$3)', [
          user.userId,
          trial.id,
          i < 10 ? manifest.requests[i + 35].id : null,
        ]);
        await db.query(
          `UPDATE public.customer_accounts SET status=$2,password_set_at=$3,onboarding_completed_at=$4,access_expires_at=CASE WHEN $5 THEN now()-interval '1 day' ELSE access_expires_at END,trial_ends_at=CASE WHEN $5 THEN now()-interval '1 day' ELSE trial_ends_at END,current_period_end=CASE WHEN $5 THEN now()-interval '1 day' ELSE current_period_end END,trial_started_at=CASE WHEN $5 THEN now()-interval '15 days' ELSE trial_started_at END,plan_started_at=CASE WHEN $5 THEN now()-interval '15 days' ELSE plan_started_at END WHERE user_id=$1`,
          [
            user.userId,
            i >= 45 ? 'suspended' : 'active',
            i >= 20 ? stamp(1) : null,
            i >= 30 ? stamp(1) : null,
            i >= 40 && i < 45,
          ],
        );
        const ticket = manifest.tickets[i];
        await db.query(
          `INSERT INTO public.support_tickets(id,user_id,name,email,phone,subject,category,priority,status,admin_unread,created_at,updated_at)
          VALUES($1,$2,$3,$4,'',$5,$6,$7,$8,$9,$10,$11)`,
          [
            ticket.id,
            user.userId,
            name('Customer', i),
            user.email,
            name(
              [
                'Calendar connection',
                'Billing question',
                'Voice quality',
                'Account access',
                'Feature request',
              ][i % 5],
              i,
            ),
            ['technical_support', 'billing', 'bug_report', 'account_issue', 'feature_request'][i % 5],
            ['low', 'medium', 'high', 'critical'][i % 4],
            ['open', 'in_progress', 'awaiting_reply', 'resolved', 'closed'][i % 5],
            i % 2 === 0,
            stamp(i + 2),
            stamp(i / 2),
          ],
        );
        for (let n = 0; n < 3; n++)
          await db.query(
            `INSERT INTO public.support_messages(ticket_id,sender_type,sender_name,body,is_internal,created_at) VALUES($1,$2,$3,$4,$5,$6)`,
            [
              ticket.id,
              n === 0 ? 'customer' : 'admin',
              n === 0 ? name('Customer', i) : 'Dummy test administrator',
              [
                'This is a dummy customer question for pagination and support testing.',
                'Dummy reply: please try reconnecting and share the result.',
                'Dummy internal follow-up: review this ticket in the next test.',
              ][n],
              n === 2,
              stamp(i + 2 - n / 10),
            ],
          );
      }
      // Separate unpaid leads and simulated payments. No real payment/provider IDs or checkout passwords.
      for (const [kind, entries] of [
        ['lead', manifest.leads],
        ['payment', manifest.payments],
      ] as const) {
        for (let i = 0; i < 50; i++) {
          const planId = manifest.plans[i % 5 === 0 ? i + 1 : i].id;
          const plan = (await db.query('SELECT * FROM public.plans WHERE id=$1', [planId])).rows[0];
          const row = entries[i];
          const paid = kind === 'payment';
          const created = stamp(paid ? 24 * (i + 1) : i + 1);
          await db.query(
            `INSERT INTO public.billing_orders(id,plan_id,plan_snapshot,currency,plan_amount,setup_fee,total,full_name,email,phone,business_name,status,paid_at,provisioned_user_id,provisioned_at,created_at,updated_at,checkout_dismissed_at,payment_error,reminder_due_at,password_hash,user_agent)
            VALUES($1,$2,$3,'INR',$4,$5,$6,$7,$8,'',$9,$10,$11,$12,$11,$13,$13,$14,$15,NULL,NULL,$16)`,
            [
              row.id,
              planId,
              JSON.stringify(plan),
              plan.price_inr,
              plan.setup_fee_inr,
              plan.price_inr + plan.setup_fee_inr,
              name(paid ? 'Simulated payer' : 'Signup lead', i),
              paid ? manifest.customers[i].email : row.email,
              name(paid ? 'Simulated payment business' : 'Unpaid business', i),
              paid ? 'provisioned' : 'created',
              paid ? created : null,
              paid ? manifest.customers[i].userId : null,
              created,
              !paid && i % 3 === 1 ? created : null,
              !paid && i % 3 === 2 ? 'DUMMY: payment failure for testing; no charge attempted.' : null,
              `dummy-pagination/${batch}`,
            ],
          );
        }
      }
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    for (let i = 0; i < 50; i++) {
      manifest.tickets[i].email = manifest.customers[i].email;
      manifest.payments[i].email = manifest.customers[i].email;
      if (i < 10) manifest.requests[i + 35].email = manifest.customers[i].email;
    }
    manifest.complete = true;
    save();
    console.log(
      JSON.stringify(
        {
          batch,
          manifest: file,
          counts: {
            requests: 50,
            customers: 50,
            support: 50,
            signupLeads: 50,
            simulatedPayments: 50,
            inactivePlans: 50,
            inactiveCoupons: 50,
          },
          emailsSent: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(
    String(error?.message || error).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[database URL redacted]'),
  );
  process.exitCode = 1;
});
