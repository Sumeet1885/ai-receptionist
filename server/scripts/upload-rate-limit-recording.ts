/**
 * One-time setup: synthesizes the shared "too many requests, please try again later" audio via
 * Gemini TTS and uploads it to Dograh as a recording. Run this once per Dograh instance (the
 * recording is organization-wide, not per-bot); paste the printed recording_id into
 * RATE_LIMITED_RECORDING_ID in src/modules/phone-calls/workflowDefinition.ts, then re-provision
 * any bots that should use the inbound rate-limit gate.
 *
 * Requires MinIO's port (9000 by default) reachable from wherever this runs - the upload is a
 * direct presigned PUT to MinIO, not proxied through Dograh's API. See
 * Call/dograh-docker/Dograh_DEPLOYMENT_GUIDE.md, Step 2.
 */
import 'dotenv/config';
import { config } from '../src/config';
import { getRecordingUploadUrl, createRecording } from '../src/modules/phone-calls/dograhClient';

const MESSAGE = 'Too many requests right now. Please try again later.';

function pcmToWav(pcm: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function synthesize(): Promise<Buffer> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${config.geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Say in a calm, polite phone-receptionist tone: ${MESSAGE}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
        },
      }),
    }
  );
  const json: any = await res.json();
  if (!res.ok) throw new Error(`Gemini TTS failed: ${res.status} ${JSON.stringify(json)}`);
  const base64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64) throw new Error(`Gemini TTS returned no audio: ${JSON.stringify(json)}`);
  return pcmToWav(Buffer.from(base64, 'base64'));
}

async function main() {
  console.log('Synthesizing audio via Gemini TTS...');
  const wav = await synthesize();
  console.log(`Generated ${wav.length} byte WAV file.`);

  console.log('Requesting presigned upload URL from Dograh...');
  const upload = await getRecordingUploadUrl('rate_limited.wav', 'audio/wav', wav.length);
  console.log('recording_id:', upload.recording_id);

  console.log('Uploading to MinIO...');
  const putRes = await fetch(upload.upload_url, { method: 'PUT', body: wav, headers: { 'Content-Type': 'audio/wav' } });
  if (!putRes.ok) throw new Error(`Upload PUT failed: ${putRes.status} ${await putRes.text()}`);

  console.log('Registering recording with Dograh...');
  const recording = await createRecording(upload.recording_id, upload.storage_key, MESSAGE);
  console.log('Done. recording_id:', recording.recording_id);
  console.log('\nNext step: paste this into RATE_LIMITED_RECORDING_ID in src/modules/phone-calls/workflowDefinition.ts');
}

main().then(() => process.exit(0)).catch(err => { console.error('FAILED:', err); process.exit(1); });
