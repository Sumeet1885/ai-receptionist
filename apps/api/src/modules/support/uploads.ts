import { randomUUID } from 'node:crypto';
import multer from 'multer';
import type { RequestHandler } from 'express';
import { supportFileError } from '@ai-receptionist/contracts';
import { supabase } from '../../services/db';
import { checked } from './repository';
import { supportBytesMatch } from './security';
import { logger } from '../../services/cloudwatchLogger';
import { deleteSupportObjects, SUPPORT_S3_PREFIX, uploadSupportObject } from './storage';

export function supportUpload(creating: boolean): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: (creating ? 2 : 10) * 1024 * 1024,
      files: creating ? 1 : 3,
      fields: 16,
      fieldSize: 24_000,
      parts: 20,
    },
  }).array('files', creating ? 1 : 3);
  return (req, res, next) =>
    upload(req, res, (error) => {
      if (error)
        return res.status(400).json({
          error:
            error.code === 'LIMIT_FILE_SIZE'
              ? `Each attachment must be ${creating ? 2 : 10} MB or smaller.`
              : 'Invalid upload. Check the file count, size and form fields.',
        });
      const files = (req.files ?? []) as Express.Multer.File[];
      const issue = supportFileError(
        files.map((f) => ({ name: f.originalname, type: f.mimetype, size: f.size })),
        creating,
      );
      if (issue || files.some((f) => !supportBytesMatch(f.buffer, f.mimetype)))
        return res.status(400).json({ error: issue || 'File contents do not match the selected file type.' });
      next();
    });
}
export interface StoredSupportFile {
  storage_key: string;
  file_name: string;
  file_size: number;
  content_type: string;
}
export async function removeSupportFiles(files: StoredSupportFile[]) {
  await deleteSupportObjects(files.map((file) => file.storage_key));
}
export async function withSupportFiles<T>(
  files: Express.Multer.File[],
  save: (files: StoredSupportFile[]) => Promise<T>,
): Promise<T> {
  const uploaded: StoredSupportFile[] = [];
  try {
    for (const file of files) {
      const key = `${SUPPORT_S3_PREFIX}${randomUUID()}/${randomUUID()}.${file.originalname.split('.').pop()!.toLowerCase()}`;
      const storedKey = await uploadSupportObject(key, file.buffer, file.mimetype);
      uploaded.push({
        storage_key: storedKey,
        file_name: file.originalname.replace(/[\x00-\x1f/\\]/g, '_').slice(0, 180),
        file_size: file.size,
        content_type: file.mimetype,
      });
    }
    return await save(uploaded);
  } catch (error) {
    await removeSupportFiles(uploaded).catch(async () => {
      try {
        if (uploaded.length)
          checked(
            await supabase
              .from('support_storage_cleanup')
              .upsert(uploaded.map((file) => ({ storage_key: file.storage_key }))),
          );
      } catch {
        logger.error('[support] attachment cleanup needs attention', {
          storageKeys: uploaded.map((file) => file.storage_key),
        });
      }
    });
    throw error;
  }
}
