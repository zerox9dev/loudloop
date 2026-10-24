import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { hash } from 'bcryptjs';
import { addDays, addHours, setHours } from 'date-fns';
import { count, eq } from 'drizzle-orm';
import { db, sql, users, projects, accounts, metricSnapshots, goals, posts, postTargets, comments, sources, challenges, type Platform } from './index';
import { dayKey, daysAgo, monthKey } from '../dates';
import { ensureInsights, detectSignals } from '../services/sync';
import { seedDemoClicks, seedFactoryDemo } from './demo-factory';
import { demoContent, demoLocale } from './demo-content';
import { isLocale } from '@/i18n/config';

/** Seeded PRNG so demo data looks the same on every fresh install. */
function prng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const rand = prng(42);
const C = demoContent();
const between = (a: number, b: number) => Math.floor(a + rand() * (b - a + 1));

const DEMO: { platform: Platform; handle: string; now: number; growth30: number; goal?: number; burst?: boolean }[] = [
  { platform: 'telegram', handle: '@loudloop', now: 6021, growth30: 1005, goal: 7000 },
  { platform: 'instagram', handle: '@loudloop', now: 9986, growth30: 1054, goal: 10000 },
  { platform: 'threads', handle: '@loudloop', now: 3500, growth30: 2267, goal: 5000, burst: true },
  { platform: 'x', handle: '@loudloop', now: 64, growth30: 0 },
  { platform: 'linkedin', handle: 'Loudloop', now: 1240, growth30: 186, goal: 1500 },
];


function series(now: number, growth30: number, days: number, burst: boolean) {
  // Build daily deltas for `days` days whose last-30-day sum is growth30, then walk back from `now`.
  const weights = Array.from({ length: days }, (_, i) => {
    const base = 0.5 + rand();
    const weekend = [0, 6].includes(daysAgo(days - 1 - i).getDay()) ? 0.6 : 1;
    const spike = burst && rand() < 0.15 ? 6 + rand() * 6 : 1;
    return base * weekend * spike;
  });
  const last30 = weights.slice(-30).reduce((s, w) => s + w, 0);
  const deltas = weights.map((w) => Math.round((w / last30) * growth30));
  const values: number[] = new Array(days);
  values[days - 1] = now;
  for (let i = days - 2; i >= 0; i--) values[i] = values[i + 1] - deltas[i + 1];
  return values;
}

async function main() {
  const ifEmpty = process.argv.includes('--if-empty');
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (ifEmpty && n > 0) {
    console.log('seed skipped: database not empty');
    await sql.end();
    return;
  }

  const email = (process.env.ADMIN_EMAIL ?? 'admin@loudloop.local').toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = randomBytes(9).toString('base64url');
    console.log(`ADMIN_PASSWORD is not set — generated password: ${password}`);
  }
  await db
    .insert(users)
    .values({ email, name: process.env.ADMIN_NAME ?? 'Founder', locale: process.env.ADMIN_LOCALE ?? demoLocale(), passwordHash: await hash(password, 10) })
    .onConflictDoNothing();

  // migration 0002 creates the default project; make sure it exists on any database
  await db.insert(projects).values({ slug: 'personal', name: C.personalName, kind: 'founder', position: 0 }).onConflictDoNothing();
  const [personal] = await db.select().from(projects).where(eq(projects.slug, 'personal'));
  // a fresh install: the migration's default project gets its name in the owner's language
  if (n === 0) {
    const ownerLocale = process.env.ADMIN_LOCALE ?? demoLocale();
    await db.update(projects).set({ name: demoContent(isLocale(ownerLocale) ? ownerLocale : undefined).personalName }).where(eq(projects.id, personal.id));
  }

  if (process.env.DEMO_MODE !== '1') {
    console.log(`seeded admin ${email}; DEMO_MODE off, no demo data`);
    await sql.end();
    return;
  }

  const now = new Date();
  const DAYS = 45;
  for (const d of DEMO) {
    const [acc] = await db.insert(accounts).values({ projectId: personal.id, platform: d.platform, handle: d.handle, status: 'demo', lastSyncedAt: new Date(Date.now() - 4 * 60_000) }).returning();
    const vals = series(d.now, d.growth30, DAYS, !!d.burst);
    await db.insert(metricSnapshots).values(vals.map((followers, i) => ({ accountId: acc.id, day: dayKey(daysAgo(DAYS - 1 - i, now)), followers })));
    if (d.goal) await db.insert(goals).values({ accountId: acc.id, month: monthKey(now), target: d.goal });
  }
  const accs = await db.select().from(accounts);
  const byPlatform = Object.fromEntries(accs.map((a) => [a.platform, a]));

  // Published history (X stays silent like in the reference design)
  const viewScale: Record<Platform, [number, number]> = { telegram: [1500, 4200], instagram: [6000, 18000], threads: [20000, 180000], x: [0, 0], linkedin: [300, 2500] };
  const reactScale: Record<Platform, [number, number]> = { telegram: [60, 250], instagram: [60, 220], threads: [300, 1600], x: [0, 0], linkedin: [10, 90] };
  for (let i = 0; i < 48; i++) {
    const at = setHours(daysAgo(between(0, 29), now), between(8, 21));
    if (at > now) continue;
    const kind = (['post', 'post', 'photo', 'reel', 'story'] as const)[between(0, 4)];
    const platforms: Platform[] = kind === 'story' ? ['instagram'] : kind === 'photo' ? ['instagram', 'telegram'] : (['telegram', 'threads'] as Platform[]).concat(rand() < 0.4 ? ['instagram'] : [], rand() < 0.5 ? ['linkedin'] : []);
    const [p] = await db.insert(posts).values({ projectId: personal.id, kind, text: C.texts[between(0, C.texts.length - 1)], status: 'published', publishedAt: at, createdAt: at, updatedAt: at }).returning();
    for (const pl of platforms) {
      const a = byPlatform[pl];
      await db.insert(postTargets).values({
        postId: p.id,
        accountId: a.id,
        status: 'published',
        externalId: `demo-${p.id}-${pl}`,
        publishedAt: at,
        views: between(...viewScale[pl]),
        reactions: between(...reactScale[pl]),
        comments: between(0, 40),
        shares: between(0, 30),
        metricsUpdatedAt: now,
      });
    }
  }

  // Upcoming schedule + drafts
  for (let i = 0; i < 6; i++) {
    const at = setHours(addDays(now, between(1, 12)), between(9, 20));
    const [p] = await db.insert(posts).values({ projectId: personal.id, kind: 'post', text: C.texts[between(0, C.texts.length - 1)], status: 'scheduled', scheduledAt: at }).returning();
    for (const pl of ['telegram', 'threads'] as Platform[]) await db.insert(postTargets).values({ postId: p.id, accountId: byPlatform[pl].id });
  }
  for (let i = 0; i < 4; i++) {
    const [p] = await db.insert(posts).values({ projectId: personal.id, kind: 'post', text: `${C.draftPrefix} ${C.texts[between(0, C.texts.length - 1)]}`, status: 'draft' }).returning();
    await db.insert(postTargets).values({ postId: p.id, accountId: byPlatform.telegram.id });
  }

  // Inbox: 87 unread like the reference
  const published = await db.select().from(postTargets);
  const withPosts = published.filter((t) => t.status === 'published');
  const rows = Array.from({ length: 110 }, (_, i) => {
    const t = withPosts[between(0, withPosts.length - 1)];
    const name = C.commenters[between(0, C.commenters.length - 1)];
    return {
      accountId: t.accountId,
      targetId: t.id,
      externalId: `demo-c-${i}`,
      authorName: name,
      authorHandle: `@${name.toLowerCase().replace(/[^\p{L}\d_.]/gu, '')}`,
      text: C.comments[between(0, C.comments.length - 1)],
      postedAt: addHours(t.publishedAt ?? now, between(1, 30)),
      isRead: i >= 87,
    };
  });
  await db.insert(comments).values(rows.map((r) => ({ ...r, postedAt: r.postedAt > now ? now : r.postedAt })));

  await db.insert(sources).values(C.sources.map((src) => ({ projectId: personal.id, ...src }))).onConflictDoNothing();

  await db.insert(challenges).values({
    projectId: personal.id,
    title: C.challenge,
    accountId: byPlatform.threads.id,
    postsPerDay: 1,
    startsOn: dayKey(daysAgo(10, now)),
    endsOn: dayKey(addDays(now, 20)),
  });
  // make the Threads streak visible (🔥 N) by guaranteeing a post on each of the last 5 days
  for (let i = 0; i < 5; i++) {
    const at = setHours(daysAgo(i, now), 7);
    if (at > now) continue;
    const [p] = await db.insert(posts).values({ projectId: personal.id, kind: 'post', text: C.texts[between(0, C.texts.length - 1)], status: 'published', publishedAt: at, createdAt: at }).returning();
    await db.insert(postTargets).values({ postId: p.id, accountId: byPlatform.threads.id, status: 'published', externalId: `demo-streak-${i}`, publishedAt: at, views: between(20000, 90000), reactions: between(300, 900) });
  }

  // a second project shows the multi-project setup: its own channels, history and goals
  const [pet] = await db.insert(projects).values({ slug: 'pet-project', name: C.petName, position: 1 }).onConflictDoNothing().returning();
  if (pet) {
    for (const d of [
      { platform: 'telegram' as const, handle: '@pet_project', now: 842, growth30: 310, goal: 1000 },
      { platform: 'threads' as const, handle: '@pet.project', now: 415, growth30: 160 },
    ]) {
      const [acc] = await db.insert(accounts).values({ projectId: pet.id, platform: d.platform, handle: d.handle, status: 'demo', lastSyncedAt: now }).returning();
      const vals = series(d.now, d.growth30, DAYS, false);
      await db.insert(metricSnapshots).values(vals.map((followers, i) => ({ accountId: acc.id, day: dayKey(daysAgo(DAYS - 1 - i, now)), followers })));
      if (d.goal) await db.insert(goals).values({ accountId: acc.id, month: monthKey(now), target: d.goal });
      for (let i = 0; i < 8; i++) {
        const at = setHours(daysAgo(between(0, 25), now), between(9, 20));
        const [p] = await db.insert(posts).values({ projectId: pet.id, kind: 'post', text: C.texts[between(0, C.texts.length - 1)], status: 'published', publishedAt: at, createdAt: at }).returning();
        await db.insert(postTargets).values({ postId: p.id, accountId: acc.id, status: 'published', externalId: `demo-pet-${p.id}`, publishedAt: at, views: between(300, 2500), reactions: between(10, 120) });
      }
    }
  }

  await seedFactoryDemo();
  await seedDemoClicks();
  await ensureInsights(true);
  await detectSignals();
  console.log(`seeded admin ${email} + demo data`);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
