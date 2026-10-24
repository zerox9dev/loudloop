import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db, ideas, linkClicks, links, postTargets, posts, projects } from './index';
import { demoContent } from './demo-content';

/** Briefs and ideas that make the demo factory produce sensible drafts. Idempotent. */
export async function seedFactoryDemo() {
  const [founder] = await db.select().from(projects).where(eq(projects.slug, 'personal'));
  const [pet] = await db.select().from(projects).where(eq(projects.slug, 'pet-project'));
  const C = demoContent();
  if (founder && !founder.brief.about) await db.update(projects).set({ kind: 'founder', brief: C.founderBrief }).where(eq(projects.id, founder.id));
  if (pet && !pet.brief.about) await db.update(projects).set({ brief: C.petBrief }).where(eq(projects.id, pet.id));

  const existing = await db.select({ id: ideas.id }).from(ideas).limit(1);
  if (existing.length) return;
  const rows = [
    ...(founder ? C.ideas.founder.map((i) => ({ projectId: founder.id, ...i })) : []),
    ...(pet ? C.ideas.pet.map((i) => ({ projectId: pet.id, kind: 'event', ...i })) : []),
  ].filter(Boolean) as (typeof ideas.$inferInsert)[];
  if (rows.length) await db.insert(ideas).values(rows);
}

/** Demo clicks on demo posts so the Clicks page has something to show. Idempotent. */
export async function seedDemoClicks() {
  const [any] = await db.select({ id: links.id }).from(links).limit(1);
  if (any) return;
  const targets = await db
    .select({ id: postTargets.id, projectId: posts.projectId, publishedAt: postTargets.publishedAt })
    .from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .where(and(eq(postTargets.status, 'published'), isNotNull(postTargets.publishedAt)))
    .orderBy(desc(postTargets.publishedAt))
    .limit(24);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const t of targets) {
    const code = randomBytes(6).toString('base64url').slice(0, 7);
    const n = Math.floor(rnd() ** 2 * 60);
    const [link] = await db.insert(links).values({ code, projectId: t.projectId, targetId: t.id, url: 'https://example.com/?utm_source=demo', clicks: n }).returning();
    const since = t.publishedAt!.getTime();
    const clicks = Array.from({ length: n }, () => ({ linkId: link.id, at: new Date(Math.min(Date.now(), since + rnd() ** 3 * 6 * 86400_000)) }));
    if (clicks.length) await db.insert(linkClicks).values(clicks);
  }
}
