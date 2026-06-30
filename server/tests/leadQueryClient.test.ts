import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');
const helperPath = path.join(workspaceRoot, 'client', 'src', 'lib', 'leadQuery.ts');
const leadsHookPath = path.join(workspaceRoot, 'client', 'src', 'hooks', 'useLeads.ts');
const appPath = path.join(workspaceRoot, 'client', 'src', 'App.tsx');

test('lead dashboard query helper narrows columns and refresh cadence', async () => {
  assert.equal(
    existsSync(helperPath),
    true,
    'expected client/src/lib/leadQuery.ts to exist so lead reads share one safe query contract'
  );

  const helper = await import(pathToFileURL(helperPath).href);

  assert.equal(
    helper.LEAD_SELECT_FIELDS,
    'id,bot_id,name,phone,email,requirement,budget,sentiment,lead_score,summary,appointment_status,updated_at'
  );
  assert.equal(helper.getLeadRefreshInterval('leads'), 15000);
  assert.equal(helper.getLeadRefreshInterval('dashboard'), 60000);
  assert.equal(helper.getLeadRefreshInterval('landing'), null);
});

test('client code uses the lead query helper instead of broad selects and fixed polling', () => {
  const leadsHookSource = readFileSync(leadsHookPath, 'utf8');
  const appSource = readFileSync(appPath, 'utf8');

  assert.match(leadsHookSource, /select\(LEAD_SELECT_FIELDS\)/);
  assert.doesNotMatch(leadsHookSource, /select\('\*'\)/);

  assert.match(appSource, /getLeadRefreshInterval\(route\.name\)/);
  assert.doesNotMatch(appSource, /setInterval\(fetchLeads,\s*15000\)/);
});
