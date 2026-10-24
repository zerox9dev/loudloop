import type { MediaItem, Platform, PostKind } from '@/lib/db/schema';
import { PLATFORM_META } from '@/lib/platforms';
import { escapeLittleText } from '@/lib/text';

const URL_RE = /https?:\/\/\S+/g;

/**
 * Length as the platform will count it: LinkedIn counts the escaped text, X counts every link as
 * 23 characters (t.co) — so UTM tags and short links don't change an X post's length.
 */
export function platformTextLength(platform: Platform, text: string) {
  if (platform === 'linkedin') return escapeLittleText(text).length;
  if (platform === 'x') return text.replace(URL_RE, 'x'.repeat(23)).length;
  return text.length;
}

export type ComposeInput = {
  kind: PostKind;
  text: string;
  media: MediaItem[];
  platforms: Platform[];
  /** platform-native texts; a platform without one uses `text` */
  variants?: Partial<Record<Platform, string | null>>;
};

/** Per-platform checks shown in the composer and enforced on save. */
/** A validation problem as a message key (namespace `validate`) plus values, rendered per locale. */
export type Issue = { code: string; values?: Record<string, string | number> };
type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Render issues with a root-level translator (needs the `validate` and `kinds` namespaces). */
export function issueTexts(issues: Issue[], t: Translate) {
  return issues.map((i) => t(`validate.${i.code}`, { ...i.values, ...(i.values?.kind ? { kind: t(`kinds.${i.values.kind}`) } : {}) }));
}

export function validateCompose({ kind, text, media, platforms, variants }: ComposeInput): Issue[] {
  const errors: Issue[] = [];
  if (platforms.length === 0) errors.push({ code: 'noPlatform' });
  const textFor = (p: Platform) => (variants?.[p]?.trim() ? variants[p]! : text);
  if (platforms.every((p) => !textFor(p).trim()) && media.length === 0) errors.push({ code: 'empty' });
  for (const p of platforms) {
    const meta = PLATFORM_META[p];
    const platform = meta.label;
    if (!meta.kinds.includes(kind)) errors.push({ code: 'kindUnsupported', values: { platform, kind } });
    const len = platformTextLength(p, textFor(p));
    if (len > meta.textLimit) errors.push({ code: 'tooLong', values: { platform, limit: meta.textLimit, len } });
    if (meta.needsMedia.includes(kind) && media.length === 0) errors.push({ code: 'needsMedia', values: { platform, kind } });
    if (kind === 'reel' && media.length > 0 && !media[0].mime.startsWith('video/')) errors.push({ code: 'reelVideo', values: { platform } });
    if (p === 'x' && media.length > 4) errors.push({ code: 'xMaxMedia' });
  }
  const seen = new Set<string>();
  return errors.filter((e) => {
    const k = JSON.stringify(e);
    return seen.has(k) ? false : (seen.add(k), true);
  });
}
