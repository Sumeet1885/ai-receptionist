import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client } from '../../aws/s3Client';
import { config } from '../../config';
import { supabase } from '../../services/db';
import { checked } from './repository';

export const SUPPORT_S3_PREFIX = 'ai-receptionist/support/';
const LEGACY_BUCKET = 'support-attachments';

export function parseSupportS3Key(storedKey: string) {
  if (!storedKey.startsWith('s3://')) return null;
  const url = new URL(storedKey);
  const key = url.pathname.slice(1);
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(url.hostname) ||
    !key.startsWith(SUPPORT_S3_PREFIX) ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid support storage location');
  return { bucket: url.hostname, key };
}

export async function uploadSupportObject(key: string, body: Buffer, contentType: string) {
  if (!config.s3.bucket) throw new Error('S3_BUCKET_NAME is not configured');
  if (!key.startsWith(SUPPORT_S3_PREFIX)) throw new Error('Invalid support object prefix');
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'private, no-store',
      ServerSideEncryption: 'AES256',
    }),
  );
  // Persist the bucket with the key so older objects keep working if configuration changes.
  return `s3://${config.s3.bucket}/${key}`;
}

export async function supportDownloadUrl(storedKey: string, filename: string) {
  const object = parseSupportS3Key(storedKey);
  if (!object) {
    // Preserve access to files uploaded before the move to S3.
    return checked(
      await supabase.storage.from(LEGACY_BUCKET).createSignedUrl(storedKey, 60, { download: filename }),
    ).signedUrl;
  }
  const safeName = filename.replace(/[\x00-\x1f\x7f"\\/]/g, '_');
  const encoded = encodeURIComponent(safeName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: object.bucket,
      Key: object.key,
      ResponseContentDisposition: `attachment; filename="download"; filename*=UTF-8''${encoded}`,
      ResponseCacheControl: 'private, no-store',
    }),
    { expiresIn: 60 },
  );
}

export async function deleteSupportObjects(keys: string[]) {
  for (const storedKey of keys) {
    const object = parseSupportS3Key(storedKey);
    if (object) await getS3Client().send(new DeleteObjectCommand({ Bucket: object.bucket, Key: object.key }));
    else checked(await supabase.storage.from(LEGACY_BUCKET).remove([storedKey]));
  }
}
