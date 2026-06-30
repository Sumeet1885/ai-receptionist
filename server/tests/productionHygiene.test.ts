import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);

async function text(path: string) {
  return readFile(fileURLToPath(new URL(path, root)), 'utf8');
}

test('credential files and Docker build context are excluded', async () => {
  const gitignore = await text('.gitignore');
  const dockerignore = await text('server/.dockerignore');

  assert.match(gitignore, /^\.env\.vercel$/m);
  assert.match(dockerignore, /^\.env/m);
  assert.match(dockerignore, /^node_modules$/m);
  await assert.rejects(access(fileURLToPath(new URL('client/.env.vercel', root)), constants.F_OK));
});

test('server typecheck covers active source and tests', async () => {
  const tsconfig = JSON.parse(await text('server/tsconfig.json'));
  const packageJson = JSON.parse(await text('server/package.json'));

  assert.deepEqual(tsconfig.include, ['src/**/*.ts', 'tests/**/*.ts']);
  assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit');
});

test('production container runs as the non-root node user', async () => {
  assert.match(await text('server/Dockerfile'), /^USER node$/m);
});

test('chat error logs do not include visitor message content', async () => {
  const source = await text('server/src/routes/chat.routes.ts');
  assert.doesNotMatch(source, /timezone,\s*userMessage,/);
});
