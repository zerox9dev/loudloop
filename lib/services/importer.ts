import { and, eq, inArray, sql } from 'drizzle-orm';
import { subDays } from 'date-fns';
import { db, accounts, comments, metricSnapshots, posts, postTargets, profileViews, type Account } from '@/lib/db';
import { getAdapter, isActive, prepareContext } from '@/lib/providers';
import type { PostMetrics, RemotePost } from '@/lib/providers/types';
import { saveRemote } from '@/lib/media';
import type { MediaItem } from '@/lib/db/schema';

/** First connect pulls everything the platform still lists; hourly syncs only look at the last few days. */
export const BACKFILL = { days: null, limit: 1000 };
export const RECENT = { days: 3, limit: 50 };

export type ImportResult = { created: number; updated: number; comments: number; followerDays: number; viewDays?: number; mediaFiles?: number; skipped?: string };

/**
 * Bring posts that already exist on the platform into the app (published natively or before
 * the account was connected). Idempotent: (account, external id) is unique, existing rows only
 * get fresher metrics.
 */
export async function importPosts(account: Account, opts: { days: number | null; limit: number; withComments: boolean }): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, comments: 0, followerDays: 0 };
  if (!isActive(account)) return { ...result, skipped: 'inactive' };
  const adapter = getAdapter(account);
  const ctx = await prepareContext(account);
  if (!adapter.fetchPosts) return { ...result, skipped: 'platform does not list posts' };

  const remote = await adapter.fetchPosts(ctx, { since: opts.days === null ? undefined : subDays(new Date(), opts.days), limit: opts.limit });
  if (remote.length === 0) return result;

  const known = await db
    .select({ id: postTargets.id, externalId: postTargets.externalId })
    .from(postTargets)
    .where(and(eq(postTargets.accountId, account.id), inArray(postTargets.externalId, remote.map((r) => r.externalId))));
  const knownIds = new Map(known.map((k) => [k.externalId!, k.id]));

  // some listings (Threads, LinkedIn) carry no counters, and regular syncs only refresh the last
  // 30 days, so older posts would stay at zero forever: ask for new ones, and for all on a full backfill
  const bare = remote.filter((r) => !r.metrics && (opts.days === null || !knownIds.has(r.externalId))).map((r) => r.externalId);
  if (bare.length) {
    const fetched = await adapter.fetchPostMetrics(ctx, bare).catch(() => ({}) as Record<string, PostMetrics>);
    for (const r of remote) r.metrics ??= fetched[r.externalId];
  }

  const fresh: RemotePost[] = [];
  for (const r of remote) {
    const id = knownIds.get(r.externalId);
    if (id) {
      if (r.metrics) await db.update(postTargets).set({ ...r.metrics, metricsUpdatedAt: new Date(), url: r.url ?? undefined }).where(eq(postTargets.id, id));
      result.updated++;
    } else fresh.push(r);
  }

  const targetByExternal = new Map<string, number>();
  for (const r of fresh) {
    const id = await db.transaction(async (tx) => {
      const [post] = await tx
        .insert(posts)
        .values({ projectId: account.projectId, kind: r.kind, text: r.text, status: 'published', imported: true, publishedAt: r.publishedAt, createdAt: r.publishedAt, updatedAt: new Date() })
        .returning({ id: posts.id });
      const [target] = await tx
        .insert(postTargets)
        .values({
          postId: post.id,
          accountId: account.id,
          status: 'published',
          externalId: r.externalId,
          url: r.url ?? null,
          publishedAt: r.publishedAt,
          ...(r.metrics ?? {}),
          metricsUpdatedAt: r.metrics ? new Date() : null,
        })
        // a concurrent import may have inserted it meanwhile: drop our post then
        .onConflictDoNothing({ target: [postTargets.accountId, postTargets.externalId] })
        .returning({ id: postTargets.id });
      if (!target) {
        tx.rollback();
        return null;
      }
      return target.id;
    }).catch((e) => (e?.message === 'Rollback' ? null : Promise.reject(e)));
    if (id) {
      targetByExternal.set(r.externalId, id);
      result.created++;
    }
  }

  // CDN links expire, so files are copied now: for new posts, and on a full backfill also for
  // posts imported before they had media
  const withMedia = remote.filter((r) => r.mediaUrls?.length && (opts.days === null || !knownIds.has(r.externalId)));
  const mediaTargets = withMedia.flatMap((r) => targetByExternal.get(r.externalId) ?? knownIds.get(r.externalId) ?? []);
  if (mediaTargets.length) {
    const stored = await db
      .select({ externalId: postTargets.externalId, postId: posts.id, media: posts.media })
      .from(postTargets)
      .innerJoin(posts, eq(posts.id, postTargets.postId))
      .where(inArray(postTargets.id, mediaTargets));
    const urls = new Map(withMedia.map((r) => [r.externalId, r.mediaUrls!]));
    for (const s of stored) {
      if (s.media.length) continue;
      const files: MediaItem[] = [];
      for (const url of urls.get(s.externalId!) ?? []) {
        const item = await saveRemote(url);
        if (item) files.push(item);
      }
      if (files.length) await db.update(posts).set({ media: files }).where(eq(posts.id, s.postId));
      result.mediaFiles = (result.mediaFiles ?? 0) + files.length;
    }
  }

  for (const [ext, id] of knownIds) targetByExternal.set(ext, id);
  if (opts.withComments && targetByExternal.size) {
    // old discussions land as already read so the inbox isn't flooded on first connect
    const readBefore = subDays(new Date(), 7);
    const remoteComments = await adapter.fetchComments(ctx, [...targetByExternal.keys()]);
    if (remoteComments.length) {
      const inserted = await db
        .insert(comments)
        .values(
          remoteComments.map((c) => ({
            accountId: account.id,
            targetId: c.postExternalId ? (targetByExternal.get(c.postExternalId) ?? null) : null,
            externalId: c.externalId,
            authorName: c.authorName,
            authorHandle: c.authorHandle ?? null,
            text: c.text,
            postedAt: c.postedAt,
            isRead: c.postedAt < readBefore,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: comments.id });
      result.comments = inserted.length;
    }
  }
  return result;
}

/** Fill daily follower snapshots from the platform's own history where it has one. */
export async function importFollowerHistory(account: Account, days = 30) {
  const adapter = getAdapter(account);
  if (!adapter.fetchFollowerHistory || !isActive(account)) return 0;
  const rows = await adapter.fetchFollowerHistory(await prepareContext(account), days);
  if (rows.length === 0) return 0;
  // never overwrite snapshots we measured ourselves
  await db
    .insert(metricSnapshots)
    .values(rows.map((r) => ({ accountId: account.id, day: r.day, followers: r.followers })))
    .onConflictDoNothing();
  return rows.length;
}

/** Upsert daily profile views from `since` (null: all the platform keeps); the latest day is still growing. */
export async function importViewHistory(account: Account, since: Date | null) {
  const adapter = getAdapter(account);
  if (!adapter.fetchViewHistory || !isActive(account)) return 0;
  const rows = await adapter.fetchViewHistory(await prepareContext(account), since);
  if (rows.length === 0) return 0;
  await db
    .insert(profileViews)
    .values(rows.map((r) => ({ accountId: account.id, day: r.day, views: r.views })))
    .onConflictDoUpdate({ target: [profileViews.accountId, profileViews.day], set: { views: sql`excluded.views`, updatedAt: new Date() } });
  return rows.length;
}

/**
 * Full one-time backfill after connecting an account.
 * A failed post import is rethrown so the queue retries it, and historyImportedAt stays empty so
 * the next sync re-queues it; the reason is kept in historyError (lastError is per-sync).
 * Follower and view history are a bonus: their failure is recorded but doesn't block completion.
 */
export async function backfillAccount(accountId: number): Promise<ImportResult> {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) return { created: 0, updated: 0, comments: 0, followerDays: 0, skipped: 'no account' };
  let result: ImportResult;
  try {
    result = await importPosts(account, { ...BACKFILL, withComments: true });
  } catch (e) {
    await db.update(accounts).set({ historyError: `post history: ${(e as Error).message}` }).where(eq(accounts.id, accountId));
    throw e;
  }
  const errors: string[] = [];
  try {
    result.followerDays = await importFollowerHistory(account, 30);
  } catch (e) {
    errors.push(`follower history: ${(e as Error).message}`);
  }
  try {
    result.viewDays = await importViewHistory(account, null);
  } catch (e) {
    errors.push(`view history: ${(e as Error).message}`);
  }
  await db.update(accounts).set({ historyImportedAt: new Date(), historyError: errors.join('\n') || null }).where(eq(accounts.id, accountId));
  return result;
}
