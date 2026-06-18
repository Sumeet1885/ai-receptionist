import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveInputTranscriptAccumulator } from '../server/src/services/llm/liveInputTranscript';

test('accumulates camelCase and snake_case input transcript fragments', async () => {
  const accumulator = new LiveInputTranscriptAccumulator();
  const saved: string[] = [];

  accumulator.accept({ serverContent: { inputTranscription: { text: 'Book a ' } } });
  accumulator.accept({ serverContent: { input_transcription: { text: 'meeting' } } });
  await accumulator.flush(async text => { saved.push(text); });

  assert.deepEqual(saved, ['Book a meeting']);
});

test('does not persist empty transcript fragments', async () => {
  const accumulator = new LiveInputTranscriptAccumulator();
  const saved: string[] = [];

  accumulator.accept({ serverContent: { inputTranscription: { text: '   ' } } });
  await accumulator.flush(async text => { saved.push(text); });

  assert.deepEqual(saved, []);
});

test('successful flush clears persisted fragments', async () => {
  const accumulator = new LiveInputTranscriptAccumulator();
  const saved: string[] = [];

  accumulator.accept({ serverContent: { inputTranscription: { text: 'Hello' } } });
  await accumulator.flush(async text => { saved.push(text); });
  await accumulator.flush(async text => { saved.push(text); });

  assert.deepEqual(saved, ['Hello']);
});

test('failed flush retains fragments for a later retry', async () => {
  const accumulator = new LiveInputTranscriptAccumulator();
  const saved: string[] = [];

  accumulator.accept({ serverContent: { inputTranscription: { text: 'Call me tomorrow' } } });
  await assert.rejects(
    accumulator.flush(async () => { throw new Error('database unavailable'); }),
    /database unavailable/,
  );
  await accumulator.flush(async text => { saved.push(text); });

  assert.deepEqual(saved, ['Call me tomorrow']);
});

