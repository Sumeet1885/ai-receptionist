import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildCapacityWorkflowDefinition } from '../src/modules/phone-calls/workflowDefinition';
import { computeInboundCapacityUntil } from '../src/modules/phone-calls/inboundRateLimiter';

test('capacity workflow starts and immediately calls the silent hangup tool', () => {
  const workflow = buildCapacityWorkflowDefinition('tool-rate-limit');

  assert.equal(workflow.edges.length, 0);
  assert.equal(workflow.nodes.length, 1);
  assert.equal(workflow.nodes[0].type, 'startCall');
  assert.deepEqual(workflow.nodes[0].data.tool_uuids, ['tool-rate-limit']);
  assert.equal(workflow.nodes[0].data.add_global_prompt, false);
  assert.match(workflow.nodes[0].data.prompt, /immediately call/i);
  assert.match(workflow.nodes[0].data.prompt, /say nothing/i);
});

test('inbound capacity window covers cooldown and hourly cap using durable attempt times', () => {
  const now = new Date('2026-06-30T10:00:00.000Z');

  assert.equal(
    computeInboundCapacityUntil({
      now,
      cooldownSeconds: 10,
      hourlyCap: 20,
      recentAttemptTimes: [now],
    })?.toISOString(),
    '2026-06-30T10:00:10.000Z'
  );

  const attempts = [
    new Date('2026-06-30T09:05:00.000Z'),
    new Date('2026-06-30T09:30:00.000Z'),
    now,
  ];

  assert.equal(
    computeInboundCapacityUntil({
      now,
      cooldownSeconds: 0,
      hourlyCap: 3,
      recentAttemptTimes: attempts,
    })?.toISOString(),
    '2026-06-30T10:05:00.000Z'
  );

  assert.equal(
    computeInboundCapacityUntil({
      now,
      cooldownSeconds: 0,
      hourlyCap: 4,
      recentAttemptTimes: attempts,
    }),
    null
  );

  assert.equal(
    computeInboundCapacityUntil({
      now,
      cooldownSeconds: 1,
      hourlyCap: 100,
      recentAttemptTimes: [new Date('2026-06-30T09:59:00.000Z')],
    }),
    null,
    'an old call should not keep extending cooldown just because it is still inside the hourly window'
  );

  assert.equal(
    computeInboundCapacityUntil({
      now,
      cooldownSeconds: 1,
      hourlyCap: 100,
      recentAttemptTimes: [
        new Date('2026-06-30T09:55:00.000Z'),
        new Date('2026-06-30T09:59:59.500Z'),
      ],
    })?.toISOString(),
    '2026-06-30T10:00:00.500Z',
    'cooldown reset time is based on the latest call time, not on when the settings are saved'
  );
});

test('Dograh inbound rate limiting has durable schema for attempts and workflow swapping', async () => {
  const migrationUrl = new URL('../supabase/migrations/20260630120000_add_dograh_rate_limits.sql', import.meta.url);
  const sql = await readFile(fileURLToPath(migrationUrl), 'utf8');

  assert.match(sql, /dograh_capacity_workflow_id/i);
  assert.match(sql, /dograh_call_time_tool_uuid/i);
  assert.match(sql, /dograh_rate_limit_tool_uuid/i);
  assert.match(sql, /dograh_inbound_active_workflow/i);
  assert.match(sql, /dograh_inbound_rate_limited_until/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.phone_call_attempts/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS phone_call_attempts_bot_created_idx/i);
  assert.match(sql, /ALTER TABLE public\.phone_call_attempts ENABLE ROW LEVEL SECURITY/i);
});
