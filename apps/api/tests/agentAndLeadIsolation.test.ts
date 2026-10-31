import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('1. unassign-agent genuinely detaches owner_id and stamps existing leads to prevent lead leakage', async () => {
  const routes = await readFile(fileURLToPath(new URL('../src/modules/customers/admin.routes.ts', import.meta.url)), 'utf8');
  
  // Checks that unassign-agent stamps leads with customer_id
  assert.match(routes, /from\('leads'\)\s*\.update\(\{\s*customer_id:\s*bot\.owner_id\s*\}\)/);
  assert.match(routes, /from\('chat_sessions'\)\s*\.update\(\{\s*customer_id:\s*bot\.owner_id\s*\}\)/);
  
  // Checks that unassign-agent detaches owner_id: null and is_active: false
  assert.match(routes, /owner_id:\s*null,\s*is_active:\s*false/);
});

test('2. assign-agent stamps untagged leads to prevent cross-customer leakage upon persona reassignment', async () => {
  const routes = await readFile(fileURLToPath(new URL('../src/modules/customers/admin.routes.ts', import.meta.url)), 'utf8');
  
  // When reassigned to another customer, prior owner's leads must be isolated
  assert.match(routes, /if\s*\(bot\.owner_id\s*&&\s*bot\.owner_id\s*!==\s*req\.params\.id\)/);
  assert.match(routes, /update\(\{\s*customer_id:\s*bot\.owner_id\s*\}\)/);
});

test('3. assign-number and unassign-number update phone line using dograh_phone_number without referencing non-existent phone_number column', async () => {
  const routes = await readFile(fileURLToPath(new URL('../src/modules/customers/admin.routes.ts', import.meta.url)), 'utf8');
  
  // Both endpoints strictly update dograh_phone_number without attempting bare phone_number
  assert.match(routes, /dograh_phone_number:\s*cleanPhone/);
  assert.match(routes, /dograh_phone_number:\s*null/);
  assert.doesNotMatch(routes, /(?<!dograh_)phone_number:\s*cleanPhone/);
  assert.doesNotMatch(routes, /(?<!dograh_)phone_number:\s*null/);
});

test('4. useLeads scopes query to active bots so unassigned bot leads are never shown to customers', async () => {
  const useLeads = await readFile(fileURLToPath(new URL('../../web/src/hooks/useLeads.ts', import.meta.url)), 'utf8');
  
  // useLeads must check for active bots and filter leads by .in('bot_id', activeBots)
  assert.match(useLeads, /from\('bots'\)\s*\.select\('id'\)\s*\.eq\('is_active',\s*true\)/);
  assert.match(useLeads, /query\.in\('bot_id',\s*activeBots\.map/);
});

test('5. CustomerDrawer keeps drawer open and updates active agent list in real-time', async () => {
  const customers = await readFile(fileURLToPath(new URL('../../admin/src/pages/Customers.tsx', import.meta.url)), 'utf8');
  
  // onChanged must reload data without calling setSelected(null), keeping drawer open
  assert.match(customers, /onChanged=\{\(\)\s*=>\s*setReload\(\(n\)\s*=>\s*n\s*\+\s*1\)\}/);
  assert.doesNotMatch(customers, /onChanged=\{\(\)\s*=>\s*\{\s*setSelected\(null\)/);
  
  // Form clears inputs cleanly after provisioning
  assert.match(customers, /setNewAgentName\(''\)/);
  assert.match(customers, /setNewAgentIndustry\(''\)/);
});

test('6. Database migration establishes customer_id scoping and RLS isolation', async () => {
  const migration = await readFile(fileURLToPath(new URL('../../../supabase/migrations/20261031140000_isolate_customer_leads.sql', import.meta.url)), 'utf8');
  
  assert.match(migration, /ALTER TABLE bots ALTER COLUMN owner_id DROP NOT NULL/);
  assert.match(migration, /ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_id/);
  assert.match(migration, /ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS customer_id/);
  assert.match(migration, /CREATE POLICY "owner_leads" ON leads/);
  assert.match(migration, /customer_id = auth\.uid\(\)/);
});

test('7. Super admin agent list properly includes all Dograh fields (workflow IDs and phone numbers)', async () => {
  const routes = await readFile(fileURLToPath(new URL('../src/modules/customers/admin.routes.ts', import.meta.url)), 'utf8');
  
  // Super admin agent queries must select dograh_workflow_id, dograh_outbound_workflow_id, and dograh_phone_number
  assert.match(routes, /select\('[^']*dograh_phone_number[^']*'\)/);
  assert.match(routes, /select\('[^']*dograh_workflow_id[^']*'\)/);
  assert.match(routes, /select\('[^']*dograh_outbound_workflow_id[^']*'\)/);
});

test('8. Sync from Dograh endpoint pulls external workflows and surfaces them in Super Admin UI', async () => {
  const routes = await readFile(fileURLToPath(new URL('../src/modules/customers/admin.routes.ts', import.meta.url)), 'utf8');
  const api = await readFile(fileURLToPath(new URL('../../admin/src/api.ts', import.meta.url)), 'utf8');
  const customers = await readFile(fileURLToPath(new URL('../../admin/src/pages/Customers.tsx', import.meta.url)), 'utf8');

  // Backend endpoint
  assert.match(routes, /router\.post\('\/sync-dograh', requireAdminRole\('support'\)/);
  assert.match(routes, /const workflows = await listWorkflows\(\)/);
  assert.match(routes, /const telephonyConfigs = await listTelephonyConfigs\(\)/);
  assert.match(routes, /owner_id:\s*null/);
  assert.match(routes, /dograh_workflow_id:\s*wfIdStr/);

  // Admin API client
  assert.match(api, /syncDograh:\s*\(\)\s*=>/);
  assert.match(api, /\/customers\/sync-dograh/);

  // Admin UI button
  assert.match(customers, /Sync from Dograh/);
  assert.match(customers, /customersApi\.syncDograh\(\)/);
});


