import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
process.env.GEMINI_API_KEY ||= 'test';

test('S3 support objects use a separate prefix, encryption, signed downloads and rollback deletion', async () => {
  const { config } = await import('../src/config');
  const { getS3Client } = await import('../src/aws/s3Client');
  const { parseSupportS3Key, supportDownloadUrl } = await import('../src/modules/support/storage');
  const { withSupportFiles } = await import('../src/modules/support/uploads');
  const client = getS3Client();
  const original = { bucket: config.s3.bucket, send: client.send, credentials: client.config.credentials };
  const commands: any[] = [];
  config.s3.bucket = 'test-support-bucket';
  client.config.credentials = async () => ({ accessKeyId: 'test-key', secretAccessKey: 'test-secret' });
  client.send = (async (command: any) => {
    commands.push(command);
    return {};
  }) as any;
  const file = {
    originalname: 'question.pdf',
    mimetype: 'application/pdf',
    size: 10,
    buffer: Buffer.from('%PDF-1.7'),
  } as Express.Multer.File;
  try {
    const saved = await withSupportFiles([file], async (files) => files[0]);
    assert.match(saved.storage_key, /^s3:\/\/test-support-bucket\/ai-receptionist\/support\//);
    assert.equal(commands[0].constructor.name, 'PutObjectCommand');
    assert.equal(commands[0].input.ServerSideEncryption, 'AES256');
    assert.equal(commands[0].input.CacheControl, 'private, no-store');
    assert.equal(commands[0].input.ACL, undefined);
    const url = new URL(await supportDownloadUrl(saved.storage_key, 'long "filename".pdf'));
    assert.equal(url.searchParams.get('X-Amz-Expires'), '60');
    assert.match(url.searchParams.get('response-content-disposition')!, /^attachment;/);
    assert.ok(!url.searchParams.get('response-content-disposition')!.includes('"filename"'));
    assert.deepEqual(parseSupportS3Key(saved.storage_key), {
      bucket: 'test-support-bucket',
      key: commands[0].input.Key,
    });
    assert.equal(parseSupportS3Key('old-supabase/path.pdf'), null);
    assert.throws(() => parseSupportS3Key('s3://test-support-bucket/some-other-crm-file.pdf'));
    await assert.rejects(
      withSupportFiles([file], async () => {
        throw new Error('transaction failed');
      }),
      /transaction failed/,
    );
    assert.equal(commands.at(-1).constructor.name, 'DeleteObjectCommand');
    assert.match(commands.at(-1).input.Key, /^ai-receptionist\/support\//);
    config.s3.bucket = '';
    await assert.rejects(
      withSupportFiles([file], async () => undefined),
      /S3_BUCKET_NAME/,
    );
  } finally {
    config.s3.bucket = original.bucket;
    client.send = original.send;
    client.config.credentials = original.credentials;
  }
});
