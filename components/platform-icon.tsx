import { siInstagram, siTelegram, siThreads, siX } from 'simple-icons';
import { cn } from '@/lib/utils';
import { PLATFORM_META } from '@/lib/platforms';
import type { Platform } from '@/lib/db/schema';

// LinkedIn asked simple-icons to drop its mark, so its glyph is inlined here.
const LINKEDIN_PATH =
  'M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z';

const PATHS: Record<Platform, string> = {
  telegram: siTelegram.path,
  instagram: siInstagram.path,
  threads: siThreads.path,
  x: siX.path,
  linkedin: LINKEDIN_PATH,
};

/** Brand mark tinted with the platform token, so it matches its chart line. */
export function PlatformIcon({ platform, size = 16, className }: { platform: Platform; size?: number; className?: string }) {
  return (
    <svg
      role="img"
      aria-label={PLATFORM_META[platform].label}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      style={{ fill: PLATFORM_META[platform].color }}
    >
      <path d={PATHS[platform]} />
    </svg>
  );
}
