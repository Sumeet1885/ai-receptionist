import { randomUUID } from 'node:crypto';
import multer from 'multer';
import type { RequestHandler } from 'express';
import { supportFileError } from '@ai-receptionist/contracts';
import { supabase } from '../../services/db';
import { checked } from './repository';
import { supportBytesMatch } from './security';
import { logger } from '../../services/cloudwatchLogger';
import { deleteSupportObjects, SUPPORT_S3_PREFIX, uploadSupportObject } from './storage';

// Multipart fields (including captcha) exist only after parsing. Bound the bytes
// held across all concurrent requests, not just the size of each individual file.
const MAX_UPLOAD_RESERVATIONS = 32 * 1024 * 1024;
let reservedUploadBytes = 0;

export function supportUpload(creating: boolean): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, done) => {
      const error = supportFileError([{ name: file.originalname, type: file.mimetype, size: 1 }], creating);
      if (error) done(new Error(error)); else done(null, true);
    },
    limits: {
      fileSize: (creating ? 2 : 10) * 1024 * 1024,
      files: creating ? 1 : 3,
      fields: 16,
      fieldSize: 24_000,
      parts: 20,
    },
  }).array('files', creating ? 1 : 3);
  return (req, res, next) => {
    const reservation = (creating ? 3 : 31) * 1024 * 1024;
    if (reservedUploadBytes + reservation > MAX_UPLOAD_RESERVATIONS) {
      res.setHeader('Retry-After', '5');
      res.status(503).json({ error: 'Attachments are busy. Please try again in a moment.' });
      return;
    }
    reservedUploadBytes += reservation;
    let released = false;
    const release = () => { clearTimeout(timer); if (!released) { released = true; reservedUploadBytes -= reservation; } };
    res.once('finish', release);
    res.once('close', release);
    const timer = setTimeout(() => { if (!res.headersSent) res.status(408).json({ error: 'Upload took too long. Please try again.' }); req.destroy(); }, 15_000);
    timer.unref?.();
    upload(req, res, (error) => {
      clearTimeout(timer);
      if (res.writableEnded || req.aborted) return;
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
  };
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
