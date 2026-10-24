import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, accounts, posts, postTargets, projects, signals } from '@/lib/db';
import { trackLinks } from '@/lib/services/links';
import { getAdapter, isActive, prepareContext, ProviderError } from '@/lib/providers';
import { ensurePublicUrl, mediaFile } from '@/lib/media';
import { PLATFORM_META } from '@/lib/platforms';
import { platformTextLength } from '@/lib/services/validate';
import { redis } from '@/lib/queue';

type Sent = { externalId: string; url?: string };

/**
 * Durable "already sent" marker in Redis, written right after the platform accepts the post.
 * If the DB write that follows fails, the next retry finds the marker and records it instead
 * of publishing again.
 */
const sentKey = (targetId: number) => `sent:target:${targetId}`;

async function markSent(targetId: number, res: Sent) {
  await redis().set(sentKey(targetId), JSON.stringify(res), 'EX', 30 * 86400);
}

async function wasSent(targetId: number): Promise<Sent | null> {
  const raw = await redis().get(sentKey(targetId));
  return raw ? (JSON.parse(raw) as Sent) : null;
}

async function recordPublished(targetId: number, res: Sent) {
  for (let attempt = 1; ; attempt++) {
    try {
      await db
        .update(postTargets)
        .set({ status: 'published', externalId: res.externalId, url: res.url ?? null, error: null, publishedAt: new Date(), attempts: sql`${postTargets.attempts} + 1` })
        .where(eq(postTargets.id, targetId));
      return;
    } catch (e) {
      if (attempt >= 5) {
        console.error(`target ${targetId} published as ${res.externalId} but could not be recorded`, e);
        throw e;
      }
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

export type PublishOutcome = { status: 'published' | 'partial' | 'failed' | 'skipped'; retry: boolean };

/**
 * Publish a post to all its pending targets.
 * Idempotent: targets already published are never re-sent, so job retries only retry failures.
 */
export async function publishPost(postId: number): Promise<PublishOutcome> {
  // Claim the post: only scheduled/failed/partial posts may move to publishing.
  const [claimed] = await db
    .update(posts)
    .set({ status: 'publishing', updatedAt: new Date() })
    .where(and(eq(posts.id, postId), inArray(posts.status, ['scheduled', 'publishing', 'partial', 'failed'])))
    .returning();
  if (!claimed) return { status: 'skipped', retry: false };

  const targets = await db
    .select({ target: postTargets, account: accounts })
    .from(postTargets)
    .innerJoin(accounts, eq(accounts.id, postTargets.accountId))
    .where(eq(postTargets.postId, postId));

  const mediaUrls = (await Promise.all(claimed.media.map((m) => ensurePublicUrl(m)))).filter((u): u is string => !!u);
  const mediaFiles = claimed.media.map((m) => mediaFile(m.path));
  let retry = false;

  const [project] = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, claimed.projectId));
  for (const { target, account } of targets) {
    if (target.status === 'published') continue;
    const already = await wasSent(target.id);
    if (already) {
      await recordPublished(target.id, already);
      continue;
    }
    let res: Sent;
    try {
      if (!isActive(account)) throw new ProviderError(`Account ${account.handle} is not connected`, false);
      if (claimed.media.length > 0 && mediaUrls.length === 0 && (account.platform === 'instagram' || account.platform === 'threads') && account.status !== 'demo')
        throw new ProviderError('Meta needs a public media URL: configure S3 (S3_*) or PUBLIC_MEDIA_URL', false);
      // the platform-native variant if there is one, with tracked links (UTM / own short links)
      const raw = target.text ?? claimed.text;
      const tracked = await trackLinks(raw, {
        projectId: claimed.projectId,
        projectSlug: project?.slug ?? 'project',
        targetId: target.id,
        postId: claimed.id,
        platform: account.platform,
      });
      const limit = PLATFORM_META[account.platform].textLimit;
      // delivery beats tracking: longer tracked links must not turn a valid post into a failure
      const text = platformTextLength(account.platform, tracked) <= limit ? tracked : raw;
      if (platformTextLength(account.platform, text) > limit) throw new ProviderError(`Text is longer than ${limit} characters`, false);

      const adapter = getAdapter(account);
      const ctx = await prepareContext(account);
      res = await adapter.publish(ctx, {
        kind: claimed.kind,
        text,
        media: claimed.media,
        mediaUrls,
        mediaFiles,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      const retryable = !(e instanceof ProviderError) || e.retryable;
      if (retryable) retry = true;
      await db
        .update(postTargets)
        .set({ status: 'failed', error: err, attempts: sql`${postTargets.attempts} + 1` })
        .where(eq(postTargets.id, target.id));
      continue;
    }
    // The post is live now: mark it in Redis first so no retry can send it again,
    // even if recording it in Postgres fails below.
    await markSent(target.id, res).catch((e) => console.error(`sent-marker for target ${target.id} failed`, e));
    await recordPublished(target.id, res);
  }

  const final = await db.select({ status: postTargets.status }).from(postTargets).where(eq(postTargets.postId, postId));
  const ok = final.filter((t) => t.status === 'published').length;
  const status: PublishOutcome['status'] = ok === final.length && ok > 0 ? 'published' : ok > 0 ? 'partial' : 'failed';
  await db
    .update(posts)
    .set({ status, publishedAt: ok > 0 ? (claimed.publishedAt ?? new Date()) : null, updatedAt: new Date() })
    .where(eq(posts.id, postId));

  if (status !== 'published') {
    await db
      .insert(signals)
      .values({
        projectId: claimed.projectId,
        kind: 'publish_failed',
        severity: 'warn',
        title: status === 'partial' ? 'Post published partially' : 'Post not published',
        body: claimed.text.slice(0, 140),
        params: { variant: status === 'partial' ? 'publish_partial' : 'publish_failed', text: claimed.text.slice(0, 140) },
        dedupeKey: `publish_failed:${postId}:${new Date().toISOString().slice(0, 13)}`,
      })
      .onConflictDoNothing();
  }
  return { status, retry: retry && status !== 'published' };
}
