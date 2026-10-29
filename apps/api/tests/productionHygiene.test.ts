import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../', import.meta.url);

async function text(path: string) {
  return readFile(fileURLToPath(new URL(path, root)), 'utf8');
}

test('credential files and Docker build context are excluded', async () => {
  const gitignore = await text('.gitignore');
  const dockerignore = await text('.dockerignore');

  assert.match(gitignore, /^\.env\.vercel$/m);
  assert.match(dockerignore, /^\.env/m);
  assert.match(dockerignore, /^node_modules$/m);
  await assert.rejects(access(fileURLToPath(new URL('apps/web/.env.vercel', root)), constants.F_OK));
});

test('server typecheck covers active source and tests', async () => {
  const tsconfig = JSON.parse(await text('apps/api/tsconfig.json'));
  const packageJson = JSON.parse(await text('apps/api/package.json'));

  assert.deepEqual(tsconfig.include, ['src/**/*.ts', 'tests/**/*.ts']);
  assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit');
});

test('production container runs as the non-root node user', async () => {
  assert.match(await text('apps/api/Dockerfile'), /^USER node$/m);
});

test('chat error logs do not include visitor message content', async () => {
  const source = await text('apps/api/src/routes/chat.routes.ts');
  assert.doesNotMatch(source, /timezone,\s*userMessage,/);
});
