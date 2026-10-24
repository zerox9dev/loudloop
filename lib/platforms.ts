import type { Platform, PostKind } from '@/lib/db/schema';

export const PLATFORMS: Platform[] = ['telegram', 'instagram', 'threads', 'x', 'linkedin'];

export const PLATFORM_META: Record<
  Platform,
  { label: string; color: string; textLimit: number; kinds: PostKind[]; needsMedia: PostKind[] }
> = {
  telegram: { label: 'Telegram', color: 'var(--platform-telegram)', textLimit: 4096, kinds: ['post', 'photo', 'reel'], needsMedia: ['photo', 'reel'] },
  instagram: { label: 'Instagram', color: 'var(--platform-instagram)', textLimit: 2200, kinds: ['photo', 'story', 'reel'], needsMedia: ['photo', 'story', 'reel'] },
  threads: { label: 'Threads', color: 'var(--platform-threads)', textLimit: 500, kinds: ['post', 'photo', 'reel'], needsMedia: ['photo', 'reel'] },
  x: { label: 'X', color: 'var(--platform-x)', textLimit: 280, kinds: ['post', 'photo', 'reel'], needsMedia: ['photo', 'reel'] },
  linkedin: { label: 'LinkedIn', color: 'var(--platform-linkedin)', textLimit: 3000, kinds: ['post', 'photo'], needsMedia: ['photo'] },
};

export const KINDS: PostKind[] = ['post', 'photo', 'story', 'reel'];

export function isPlatform(v: string): v is Platform {
  return (PLATFORMS as string[]).includes(v);
}

export const RANGES = [7, 30, 90] as const;
