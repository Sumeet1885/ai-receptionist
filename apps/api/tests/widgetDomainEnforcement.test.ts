import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('widget loader waits for an authorized bot config response before rendering the launcher', async () => {
  const source = await readFile(
    fileURLToPath(new URL('../src/controllers/widgetController.ts', import.meta.url)),
    'utf8',
  );

  assert.match(source, /fetch\(baseUrl \+ '\/api\/chat\/bot\/' \+ encodeURIComponent\(botId\), \{ method: 'GET' \}\)/);
  assert.match(source, /\.then\(function\(data\)\s*\{\s*if \(!data \|\| !data\.widget_config\) return;\s*mountWidget\(\);\s*applyConfig\(data\.widget_config\);/s);
  assert.doesNotMatch(source, /document\.body\.appendChild\(bubble\);\s*document\.body\.appendChild\(container\);\s*applyConfig\(config\);\s*[\s\S]*fetch\(baseUrl \+ '\/api\/chat\/bot\//s);
});
