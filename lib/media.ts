import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { MediaItem } from '@/lib/db/schema';
import { mirrorToS3, s3Enabled, s3PublicUrl } from '@/lib/storage';

export const MEDIA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_DIR ?? './data/media');

export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime'];

export async function saveUpload(file: File): Promise<MediaItem> {
  if (!ALLOWED_MIME.includes(file.type)) throw new Error(`Unsupported file type: ${file.type}`);
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const name = `${randomUUID()}.${ext}`;
  await mkdir(MEDIA_DIR, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(/*turbopackIgnore: true*/ MEDIA_DIR, name), buf);
  // best effort: the upload stays usable for Telegram/X/LinkedIn even if the bucket is down
  let s3 = false;
  if (s3Enabled()) {
    try {
      await mirrorToS3(name, buf, file.type);
      s3 = true;
    } catch (e) {
      console.error(`s3 mirror failed for ${name}`, e);
    }
  }
  let width: number | undefined;
  let height: number | undefined;
  if (file.type.startsWith('image/')) {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buf).metadata().catch(() => null);
    width = meta?.width;
    height = meta?.height;
  }
  return { path: name, mime: file.type, width, height, ...(s3 ? { s3 } : {}) };
}

/** Resolve a stored media name to an absolute path, refusing traversal. */
export function mediaFile(name: string) {
  const safe = path.basename(name);
  return path.join(/*turbopackIgnore: true*/ MEDIA_DIR, safe);
}

/**
 * Public URL for Meta to fetch. Files uploaded before S3 was enabled (no `s3` flag) are mirrored
 * on demand from the local copy, so older scheduled posts keep working.
 */
export async function ensurePublicUrl(item: MediaItem): Promise<string | null> {
  if (!item.s3 && s3Enabled()) {
    try {
      const { readFile } = await import('node:fs/promises');
      await mirrorToS3(path.basename(item.path), await readFile(mediaFile(item.path)), item.mime);
      return s3PublicUrl(path.basename(item.path));
    } catch (e) {
      console.error(`on-demand s3 mirror failed for ${item.path}`, e);
    }
  }
  return mediaPublicUrl(item);
}

export function mediaPublicUrl(item: MediaItem) {
  const name = item.path;
  if (item.s3 && s3Enabled()) return s3PublicUrl(path.basename(name));
  const base = process.env.PUBLIC_MEDIA_URL?.replace(/\/$/, '');
  return base ? `${base}/media/${encodeURIComponent(path.basename(name))}` : null;
}
