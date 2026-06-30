import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');
const helperPath = path.join(workspaceRoot, 'client', 'src', 'lib', 'botQuery.ts');
const botsHookPath = path.join(workspaceRoot, 'client', 'src', 'hooks', 'useBots.ts');

test('bot dashboard query helper narrows selected bot columns', async () => {
  assert.equal(
    existsSync(helperPath),
    true,
    'expected client/src/lib/botQuery.ts to exist so bot reads share one safe query contract'
  );

  const helper = await import(pathToFileURL(helperPath).href);

  assert.equal(
    helper.BOT_SELECT_FIELDS,
    'id,business_name,industry,subdomain,greeting,primary_color,languages,knowledge_base,allowed_domains,widget_config,created_at,is_active'
  );
});

test('bot client code uses the narrowed bot query helper instead of broad selects', () => {
  const botsHookSource = readFileSync(botsHookPath, 'utf8');
  const fetchBotsSection = botsHookSource.match(/const fetchBots = useCallback\(async \([\s\S]*?\) => \{[\s\S]*?\}, \[\]\);/);

  assert.ok(fetchBotsSection, 'expected to find fetchBots implementation in useBots hook');
  assert.match(fetchBotsSection[0], /select\(BOT_SELECT_FIELDS\)/);
  assert.doesNotMatch(fetchBotsSection[0], /select\('\*'\)/);
  assert.match(botsHookSource, /select\(BOT_SELECT_FIELDS\)/);
});
