import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS } from '@ai-receptionist/contracts';

const apps = fileURLToPath(new URL('../../', import.meta.url));

// Forms where every typed field must carry a maximum (sign in, register / request access,
// checkout, password screens and the whole admin console).
const FORM_FILES = [
  'web/src/components/auth/AuthView.tsx',
  'web/src/components/auth/AccountStageView.tsx',
  'web/src/components/auth/RequestAccessView.tsx',
  'web/src/components/billing/CheckoutView.tsx',
  'admin/src/AuthScreens.tsx',
];

async function adminPages() {
  const dir = path.join(apps, 'admin/src/pages');
  return (await readdir(dir)).filter((f) => f.endsWith('.tsx')).map((f) => `admin/src/pages/${f}`);
}

test('every text, email, password and number field has a maxLength', async () => {
  const missing: string[] = [];
  for (const file of [...FORM_FILES, ...(await adminPages())]) {
    const source = await readFile(path.join(apps, file), 'utf8');
    for (const match of source.matchAll(/<(Input|input|textarea|Textarea)\b([\s\S]*?)\/>/g)) {
      const tag = match[0];
      if (/type="(checkbox|radio|date)"/.test(tag)) continue;
      if (!/maxLength=/.test(tag)) missing.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
    }
  }
  assert.deepEqual(missing, [], `fields without maxLength:\n${missing.join('\n')}`);
});

test('limits are sane: every min is below its max', () => {
  for (const [name, limit] of Object.entries(LIMITS)) {
    const { min, max } = limit as { min?: number; max: number };
    assert.ok(max > 0, `${name}.max`);
    if (min !== undefined) assert.ok(min < max, `${name}.min < max`);
  }
});

test('server caps login and password input before hashing', async () => {
  const routes = await readFile(path.join(apps, 'api/src/modules/admin-auth/admin-auth.routes.ts'), 'utf8');
  assert.match(routes, /password\.length > LIMITS\.adminPassword\.max/);
  assert.match(routes, /currentPassword\.length > LIMITS\.adminPassword\.max/);
});
