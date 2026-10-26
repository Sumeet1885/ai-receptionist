#!/usr/bin/env node
// Enforces browser/server import boundaries between workspaces without adding a linter.
// Run: npm run check:boundaries   (after `turbo run build` it also scans the built bundles)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const violations = [];

function walk(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full, exts);
    return exts.includes(path.extname(entry.name)) ? [full] : [];
  });
}

function importsOf(source) {
  const specs = [];
  const pattern = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(pattern)) specs.push(match[1] || match[2] || match[3]);
  return specs;
}

function checkSources(dir, rules) {
  for (const file of walk(path.join(root, dir), ['.ts', '.tsx', '.js', '.mjs'])) {
    const source = fs.readFileSync(file, 'utf8');
    const rel = path.relative(root, file).replaceAll('\\', '/');
    for (const spec of importsOf(source)) {
      const resolved = spec.startsWith('.') ? path.relative(root, path.resolve(path.dirname(file), spec)).replaceAll('\\', '/') : spec;
      for (const [test, reason] of rules.imports ?? []) {
        if (test(spec, resolved)) violations.push(`${rel}: imports "${spec}" — ${reason}`);
      }
    }
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const [pattern, reason] of rules.source ?? []) {
      if (pattern.test(code)) violations.push(`${rel}: ${reason}`);
    }
  }
}

const browserImportRules = [
  [(spec, resolved) => resolved.startsWith('apps/api') || spec.startsWith('@ai-receptionist/api'), 'browser code must not import the API'],
  [(spec) => spec.startsWith('node:') || ['fs', 'path', 'child_process', 'express', 'dotenv'].includes(spec), 'browser code must not import Node/server modules'],
];

checkSources('apps/web/src', {
  imports: [
    ...browserImportRules,
    [(spec, resolved) => resolved.startsWith('apps/admin') || spec.startsWith('@ai-receptionist/admin'), 'web must not import admin; share through packages/'],
  ],
});

checkSources('apps/admin/src', {
  imports: [
    ...browserImportRules,
    [(spec, resolved) => resolved.startsWith('apps/web') || spec.startsWith('@ai-receptionist/web'), 'admin must not import web; share through packages/'],
    [(spec) => spec.startsWith('@supabase/'), 'admin must not access the database directly; use the API'],
  ],
});

checkSources('packages', {
  imports: [
    [(spec, resolved) => resolved.startsWith('apps/') || /^@ai-receptionist\/(web|api|admin)/.test(spec), 'packages must not depend on apps'],
    [(spec) => spec.startsWith('node:') || spec.startsWith('@supabase/') || spec === 'express', 'packages must stay browser-safe'],
  ],
  source: [[/process\.env/, 'packages must not read process.env']],
});

// Service-role clients: exactly one, in apps/api/src/services/db.ts.
for (const file of walk(path.join(root, 'apps'), ['.ts', '.tsx'])) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  if (rel.includes('/legacy/') || rel.includes('/tests/')) continue;
  if (/createClient\([^)]*[Ss]ervice/.test(fs.readFileSync(file, 'utf8')) && rel !== 'apps/api/src/services/db.ts') {
    violations.push(`${rel}: creates a service-role client — use apps/api/src/services/db.ts`);
  }
}

// Built browser bundles must not contain server secrets or their names.
const forbiddenInBundles = ['SUPABASE_SERVICE_ROLE_KEY', 'service_role', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'PHONE_TOOLS_API_KEY', 'DOGRAH_API_KEY', 'sb_secret_'];
for (const app of ['apps/web/dist', 'apps/admin/dist']) {
  for (const file of walk(path.join(root, app), ['.js', '.html', '.css'])) {
    const text = fs.readFileSync(file, 'utf8');
    for (const needle of forbiddenInBundles) {
      if (text.includes(needle)) violations.push(`${path.relative(root, file).replaceAll('\\', '/')}: bundle contains "${needle}"`);
    }
  }
}

if (violations.length) {
  console.error(`Boundary check failed (${violations.length}):\n  ${violations.join('\n  ')}`);
  process.exit(1);
}
console.log('Boundary check passed.');
