/** Apply the catalogue seed and record its migration atomically. No payments or emails. */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

async function main() {
  if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required.');
  const version = '20261029110000';
  const sql = readFileSync(resolve('../../supabase/migrations/20261029110000_seed_usd_minute_topups.sql'), 'utf8');
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout = '3s'; SET LOCAL statement_timeout = '20s'");
    const applied = await db.query('SELECT version FROM supabase_migrations.schema_migrations WHERE version=$1', [version]);
    if (!applied.rowCount) {
      await db.query(sql);
      await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)', [version, 'seed_usd_minute_topups', [sql]]);
    }
    const query = "SELECT slug, feature_values->>'topup_minutes' AS minutes, feature_values->>'topup_500_minutes_usd' AS usd FROM public.plans WHERE slug IN ('ai-starter','ai-growth','ai-business-pro') ORDER BY sort_order";
    const before = (await db.query(query)).rows;
    if (before.length !== 3 || before.some(row => !row.usd || !row.minutes)) throw new Error('Expected all three paid plans to have USD top-up prices and pack sizes.');
    // Reapplying must preserve configured prices and pack sizes.
    await db.query(sql);
    const after = (await db.query(query)).rows;
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Catalogue seed was not idempotent.');
    await db.query('COMMIT');
    console.log(JSON.stringify({ plans: after, migration: version, idempotent: true, emailsSent: 0, paymentsMade: 0 }));
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { await db.end(); }
}

void main().catch(error => { console.error(error.message); process.exitCode = 1; });
