import Parser from 'rss-parser';
import { eq, isNull } from 'drizzle-orm';
import { db, ideas, projects, sources, sourceItems } from '@/lib/db';

const parser = new Parser({ timeout: 15_000 });

export async function fetchSource(source: typeof sources.$inferSelect) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = (feed.items ?? []).slice(0, 30).map((i) => ({
      sourceId: source.id,
      guid: i.guid ?? i.link ?? i.title ?? '',
      title: (i.title ?? '(untitled)').slice(0, 500),
      link: i.link ?? null,
      summary: (i.contentSnippet ?? '').slice(0, 1000) || null,
      publishedAt: i.isoDate ? new Date(i.isoDate) : null,
    }));
    if (items.length) {
      const inserted = await db.insert(sourceItems).values(items.filter((i) => i.guid)).onConflictDoNothing().returning();
      // every new item is a candidate idea for this project; release/changelog feeds are product events
      const isEvent = /releases|changelog|release-notes|updates/i.test(source.url);
      if (inserted.length)
        await db
          .insert(ideas)
          .values(inserted.map((i) => ({ projectId: source.projectId, kind: isEvent ? 'event' : 'rss', title: i.title, body: i.summary, url: i.link, sourceItemId: i.id })))
          .onConflictDoNothing();
    }
    await db.update(sources).set({ lastFetchedAt: new Date(), lastError: null }).where(eq(sources.id, source.id));
  } catch (e) {
    await db.update(sources).set({ lastFetchedAt: new Date(), lastError: (e as Error).message }).where(eq(sources.id, source.id));
  }
}

export async function fetchAllSources() {
  const active = await db
    .select({ s: sources })
    .from(sources)
    .innerJoin(projects, eq(projects.id, sources.projectId))
    .where(isNull(projects.archivedAt));
  for (const { s } of active) await fetchSource(s);
}
