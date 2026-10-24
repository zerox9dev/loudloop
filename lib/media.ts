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
  return saveBuffer(Buffer.from(await file.arrayBuffer()), file.type, ext);
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };
const MAX_REMOTE_BYTES = 100 * 1024 * 1024;

/** Copy a file from a platform CDN into our storage; null when it's gone, too big or not media. */
export async function saveRemote(url: string): Promise<MediaItem | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!res?.ok) return null;
  const mime = res.headers.get('content-type')?.split(';')[0].trim() ?? '';
  if (!ALLOWED_MIME.includes(mime) || Number(res.headers.get('content-length') ?? 0) > MAX_REMOTE_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_REMOTE_BYTES) return null;
  return saveBuffer(buf, mime, EXT[mime]);
}

async function saveBuffer(buf: Buffer, mime: string, ext: string): Promise<MediaItem> {
  const name = `${randomUUID()}.${ext}`;
  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ MEDIA_DIR, name), buf);
  // best effort: the upload stays usable for Telegram/X/LinkedIn even if the bucket is down
  let s3 = false;
  if (s3Enabled()) {
    try {
      await mirrorToS3(name, buf, mime);
      s3 = true;
    } catch (e) {
      console.error(`s3 mirror failed for ${name}`, e);
    }
  }
  let width: number | undefined;
  let height: number | undefined;
  if (mime.startsWith('image/')) {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buf).metadata().catch(() => null);
    width = meta?.width;
    height = meta?.height;
  }
  return { path: name, mime: mime, width, height, ...(s3 ? { s3 } : {}) };
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
