import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, links, type Platform } from '@/lib/db';

const URL_RE = /https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?…»)]/g;
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function code(len = 7) {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function linksBase() {
  return process.env.LINKS_BASE_URL?.replace(/\/$/, '') || null;
}

/** Adds UTM tags unless the URL already carries its own. */
export function withUtm(url: string, utm: { source: Platform; campaign: string; content: string }) {
  try {
    const u = new URL(url);
    if ([...u.searchParams.keys()].some((k) => k.startsWith('utm_'))) return url;
    u.searchParams.set('utm_source', utm.source);
    u.searchParams.set('utm_medium', 'social');
    u.searchParams.set('utm_campaign', utm.campaign);
    u.searchParams.set('utm_content', utm.content);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Rewrites every link in a post for one platform: UTM tags always, and our own short link
 * (/l/:code, counts clicks) when LINKS_BASE_URL is public. Stable per target: retries reuse codes.
 */
export async function trackLinks(text: string, ctx: { projectId: number; projectSlug: string; targetId: number; postId: number; platform: Platform }) {
  const base = linksBase();
  const urls = [...new Set(text.match(URL_RE) ?? [])].filter((u) => !(base && u.startsWith(base)));
  const replacements = new Map<string, string>();
  for (const url of urls) {
    const tagged = withUtm(url, { source: ctx.platform, campaign: ctx.projectSlug, content: `post-${ctx.postId}` });
    let replacement = tagged;
    if (base) {
      const [existing] = await db.select().from(links).where(and(eq(links.targetId, ctx.targetId), eq(links.url, tagged)));
      const row = existing ?? (await db.insert(links).values({ code: code(), projectId: ctx.projectId, targetId: ctx.targetId, url: tagged }).returning())[0];
      replacement = `${base}/l/${row.code}`;
    }
    replacements.set(url, replacement);
  }
  // token-wise: a URL that is a prefix of another one must not touch the longer link
  return text.replace(URL_RE, (m) => replacements.get(m) ?? m);
}
