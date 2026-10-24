import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';
import { db, accounts, comments, insights, metricSnapshots, postTargets, posts, signals, type Account } from '@/lib/db';
import { buildContext, getAdapter, isActive, prepareContext } from '@/lib/providers';
import { dayKey, daysAgo } from '@/lib/dates';
import { PLATFORM_META } from '@/lib/platforms';
import { generateInsight } from './insights';
import { ownerLocale } from './owner';
import { translatorFor } from '@/lib/i18n/translator';
import { summarizeAccount } from './analytics';
import { importPosts, importViewHistory, RECENT } from './importer';
import { enqueueBackfill } from '@/lib/queue';

/** Pull followers, post metrics and comments for one account. */
export async function syncAccount(account: Account) {
  if (!isActive(account)) return;
  const adapter = getAdapter(account);
  const errors: string[] = [];
  let ctx;
  try {
    ctx = await prepareContext(account);
  } catch (e) {
    errors.push(`refresh: ${(e as Error).message}`);
    ctx = buildContext(account);
  }

  try {
    const { followers } = await adapter.fetchStats(ctx);
    if (followers !== null)
      await db
      .insert(metricSnapshots)
      .values({ accountId: account.id, day: dayKey(), followers })
      .onConflictDoUpdate({
        target: [metricSnapshots.accountId, metricSnapshots.day],
        set: { followers, updatedAt: new Date() },
      });
  } catch (e) {
    errors.push(`stats: ${(e as Error).message}`);
  }

  // posts published natively (outside the app) since the last sync
  try {
    if (account.historyImportedAt) await importPosts(account, { ...RECENT, withComments: false });
  } catch (e) {
    errors.push(`new posts: ${(e as Error).message}`);
  }

  try {
    if (account.historyImportedAt) await importViewHistory(account, daysAgo(RECENT.days));
  } catch (e) {
    errors.push(`views: ${(e as Error).message}`);
  }

  const recent = await db
    .select({ id: postTargets.id, externalId: postTargets.externalId })
    .from(postTargets)
    .where(and(eq(postTargets.accountId, account.id), eq(postTargets.status, 'published'), isNotNull(postTargets.externalId), gte(postTargets.publishedAt, daysAgo(30))))
    .orderBy(desc(postTargets.publishedAt));
  const byExternal = new Map(recent.map((r) => [r.externalId!, r.id]));

  try {
    const metrics = await adapter.fetchPostMetrics(ctx, [...byExternal.keys()]);
    for (const [ext, m] of Object.entries(metrics)) {
      const id = byExternal.get(ext);
      if (id) await db.update(postTargets).set({ ...m, metricsUpdatedAt: new Date() }).where(eq(postTargets.id, id));
    }
  } catch (e) {
    errors.push(`metrics: ${(e as Error).message}`);
  }

  try {
    const remote = await adapter.fetchComments(ctx, [...byExternal.keys()].slice(0, 15));
    if (remote.length) {
      await db
        .insert(comments)
        .values(
          remote.map((c) => ({
            accountId: account.id,
            targetId: c.postExternalId ? (byExternal.get(c.postExternalId) ?? null) : null,
            externalId: c.externalId,
            authorName: c.authorName,
            authorHandle: c.authorHandle ?? null,
            text: c.text,
            postedAt: c.postedAt,
          })),
        )
        .onConflictDoNothing();
    }
  } catch (e) {
    errors.push(`comments: ${(e as Error).message}`);
  }

  await db
    .update(accounts)
    .set({ lastSyncedAt: new Date(), lastError: errors.length ? errors.join('\n') : null })
    .where(eq(accounts.id, account.id));
}

export async function syncAll() {
  const all = await db.select().from(accounts);
  for (const a of all) {
    try {
      // accounts without a finished backfill (new, failed, or connected before the feature) get one queued
      if (isActive(a) && !a.historyImportedAt) await enqueueBackfill(a.id);
      await syncAccount(a);
    } catch (e) {
      console.error(`sync ${a.platform} ${a.handle} failed`, e);
    }
  }
  await detectSignals();
  await ensureInsights();
}

/** One AI/template line per account per day. */
export async function ensureInsights(force = false) {
  const today = dayKey();
  const locale = await ownerLocale();
  const { f } = translatorFor(locale);
  const all = (await db.select().from(accounts)).filter(isActive);
  for (const a of all) {
    if (!force) {
      const [exists] = await db.select({ id: insights.id }).from(insights).where(and(eq(insights.accountId, a.id), eq(insights.day, today)));
      if (exists) continue;
    }
    const s = await summarizeAccount(a, 7);
    const top = await topPostRatio(a.id);
    const line = await generateInsight({
      platform: a.platform,
      followers: s.followers,
      yesterday: s.yesterday ?? 0,
      today: s.today ?? 0,
      weekday: f.date(daysAgo(1), 'EEEE'),
      goal: s.goal
        ? { target: s.goal.target, perDayNeeded: s.goal.perDayNeeded, plannedPerDay: s.goal.plannedPerDay, percent: s.goal.percent, daysLeft: s.goal.daysLeft }
        : undefined,
      topPost: top ?? undefined,
    }, locale);
    await db
      .insert(insights)
      .values({ accountId: a.id, day: today, ...line })
      .onConflictDoUpdate({ target: [insights.accountId, insights.day], set: { ...line, createdAt: new Date() } });
  }
}

async function topPostRatio(accountId: number) {
  const rows = await db
    .select({ views: postTargets.views, text: posts.text })
    .from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .where(and(eq(postTargets.accountId, accountId), eq(postTargets.status, 'published'), gte(postTargets.publishedAt, daysAgo(30))));
  if (rows.length < 4) return null;
  const sorted = [...rows].sort((a, b) => a.views - b.views);
  const median = sorted[Math.floor(sorted.length / 2)].views || 1;
  const recent = await db
    .select({ views: postTargets.views, text: posts.text })
    .from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .where(and(eq(postTargets.accountId, accountId), eq(postTargets.status, 'published'), gte(postTargets.publishedAt, daysAgo(3))))
    .orderBy(desc(postTargets.views))
    .limit(1);
  if (!recent[0]) return null;
  return { text: recent[0].text, views: recent[0].views, ratio: recent[0].views / median };
}

/** Rule-based signals: viral posts, growth spikes/drops, silence, expiring tokens. */
export async function detectSignals() {
  const all = (await db.select().from(accounts)).filter(isActive);
  const today = dayKey();
  const rows: (typeof signals.$inferInsert)[] = [];

  for (const a of all) {
    const label = `${PLATFORM_META[a.platform].label} ${a.handle}`;

    const top = await topPostRatio(a.id);
    if (top && top.ratio >= 2.5)
      rows.push({
        projectId: a.projectId,
        accountId: a.id,
        kind: 'viral_post',
        severity: 'good',
        title: `${label}: post did ${top.ratio.toFixed(1)}× the median`,
        body: top.text.slice(0, 160),
        params: { label, ratio: top.ratio.toFixed(1), text: top.text.slice(0, 160) },
        dedupeKey: `viral:${a.id}:${today}`,
      });

    const snaps = await db
      .select({ day: metricSnapshots.day, followers: metricSnapshots.followers })
      .from(metricSnapshots)
      .where(and(eq(metricSnapshots.accountId, a.id), gte(metricSnapshots.day, dayKey(daysAgo(15)))))
      .orderBy(metricSnapshots.day);
    if (snaps.length >= 5) {
      const deltas = snaps.slice(1).map((s, i) => s.followers - snaps[i].followers);
      const last = deltas.at(-2) ?? 0; // yesterday's full-day delta
      const base = deltas.slice(0, -2);
      const avg = base.reduce((s, d) => s + d, 0) / Math.max(base.length, 1);
      if (last > Math.max(avg * 2, 10))
        rows.push({ projectId: a.projectId, accountId: a.id, kind: 'growth_spike', severity: 'good', title: `${label}: follower spike`, body: `+${last}/day vs ${Math.round(avg)} avg`, params: { label, delta: last, avg: Math.round(avg) }, dedupeKey: `spike:${a.id}:${today}` });
      if (last < 0 && Math.abs(last) > Math.max(Math.abs(avg), 5))
        rows.push({ projectId: a.projectId, accountId: a.id, kind: 'growth_drop', severity: 'warn', title: `${label}: unfollows`, body: `${last}/day`, params: { label, delta: last }, dedupeKey: `drop:${a.id}:${today}` });
    }

    const [lastPost] = await db
      .select({ at: postTargets.publishedAt })
      .from(postTargets)
      .where(and(eq(postTargets.accountId, a.id), eq(postTargets.status, 'published')))
      .orderBy(desc(postTargets.publishedAt))
      .limit(1);
    if (!lastPost?.at || lastPost.at < daysAgo(3))
      rows.push({ projectId: a.projectId, accountId: a.id, kind: 'silence', severity: 'info', title: `${label}: 3+ days without posts`, body: null, params: { label }, dedupeKey: `silence:${a.id}:${today}` });

    if (a.tokenExpiresAt && a.tokenExpiresAt < daysAgo(-7))
      rows.push({ projectId: a.projectId, accountId: a.id, kind: 'token_expiring', severity: 'warn', title: `${label}: token expires soon`, body: null, params: { label }, dedupeKey: `token:${a.id}:${today}` });
  }

  if (rows.length) await db.insert(signals).values(rows).onConflictDoNothing();
}
