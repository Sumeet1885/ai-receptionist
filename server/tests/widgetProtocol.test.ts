import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('embedded widget uses the same typed-input WebSocket protocol as the backend', async () => {
  const source = await readFile(
    fileURLToPath(new URL('../src/controllers/widgetController.ts', import.meta.url)),
    'utf8',
  );

  assert.match(source, /msg\.type === 'request_input' && msg\.field/);
  assert.match(source, /type:\s*'textInput',\s*data:\s*validation\.normalized,\s*field:\s*pendingInputField/);
  assert.doesNotMatch(source, /msg\.type === 'request_input' && msg\.inputType/);
  assert.doesNotMatch(source, /type:\s*'textInput',\s*text:\s*text/);
});
