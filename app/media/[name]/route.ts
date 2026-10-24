import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { mediaFile } from '@/lib/media';

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime' };

/** Public media endpoint: Meta APIs fetch post media from here via PUBLIC_MEDIA_URL. Names are random UUIDs. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = mediaFile(name);
  try {
    await stat(file);
  } catch {
    return new Response('not found', { status: 404 });
  }
  const ext = path.extname(file).slice(1).toLowerCase();
  return new Response(new Uint8Array(await readFile(file)), {
    headers: { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' },
  });
}
