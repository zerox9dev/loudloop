import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { eq, like } from 'drizzle-orm';
import { db, sql, accounts, posts, postTargets, signals } from '@/lib/db';
import { publishPost } from '@/lib/services/publish';

const dbUp = await sql`select 1`.then(() => true, () => false);

describe.skipIf(!dbUp)('publishPost (integration, demo provider)', () => {
  const created: number[] = [];
  afterAll(async () => {
    for (const id of created) {
      await db.delete(posts).where(eq(posts.id, id));
      // publish failures raise signals; don't leave this test's noise in the dashboard
      await db.delete(signals).where(like(signals.dedupeKey, `publish_failed:${id}:%`));
    }
  });

  it('never re-sends targets that are already published and is a no-op on repeat', async () => {
    const demo = await db.select().from(accounts).where(eq(accounts.status, 'demo'));
    expect(demo.length).toBeGreaterThanOrEqual(2);
    const [a, b] = demo;
    const [post] = await db.insert(posts).values({ projectId: a.projectId, kind: 'post', text: 'idempotency', status: 'partial' }).returning();
    created.push(post.id);
    await db.insert(postTargets).values([
      { postId: post.id, accountId: a.id, status: 'published', externalId: 'already-there', publishedAt: new Date() },
      { postId: post.id, accountId: b.id, status: 'failed', error: 'boom' },
    ]);

    const first = await publishPost(post.id);
    expect(first.status).toBe('published');
    const targets = await db.select().from(postTargets).where(eq(postTargets.postId, post.id));
    expect(targets.find((t) => t.accountId === a.id)?.externalId).toBe('already-there');
    expect(targets.find((t) => t.accountId === b.id)?.status).toBe('published');

    const second = await publishPost(post.id);
    expect(second).toEqual({ status: 'skipped', retry: false });
  });

  it('records a target from the Redis sent-marker instead of publishing it again', async () => {
    const { redis } = await import('@/lib/queue');
    const [a] = await db.select().from(accounts).where(eq(accounts.status, 'demo'));
    const [post] = await db.insert(posts).values({ projectId: a.projectId, kind: 'post', text: 'marker', status: 'publishing' }).returning();
    created.push(post.id);
    const [t] = await db.insert(postTargets).values({ postId: post.id, accountId: a.id }).returning();
    await redis().set(`sent:target:${t.id}`, JSON.stringify({ externalId: 'sent-before-crash', url: 'https://t.me/x/1' }), 'EX', 60);
    const res = await publishPost(post.id);
    expect(res.status).toBe('published');
    const [after] = await db.select().from(postTargets).where(eq(postTargets.id, t.id));
    expect(after.externalId).toBe('sent-before-crash');
    await redis().del(`sent:target:${t.id}`);
  });

  it('marks text over the platform limit as a non-retryable failure', async () => {
    const [x] = await db.select().from(accounts).where(eq(accounts.platform, 'x'));
    const [post] = await db.insert(posts).values({ projectId: x.projectId, kind: 'post', text: 'x'.repeat(400), status: 'scheduled' }).returning();
    created.push(post.id);
    await db.insert(postTargets).values({ postId: post.id, accountId: x.id });
    const res = await publishPost(post.id);
    expect(res).toEqual({ status: 'failed', retry: false });
  });
});

describe.skipIf(!dbUp)('project scoping (integration)', () => {
  it('a project scope never returns another project’s posts or accounts', async () => {
    const { listProjects, scopeAccounts } = await import('@/lib/projects');
    const { listPosts } = await import('@/lib/services/posts');
    const list = await listProjects();
    if (list.length < 2) return;
    for (const p of list) {
      const scope = { slug: p.slug, project: p, projectIds: [p.id] };
      const accs = await scopeAccounts(scope);
      expect(accs.every((a) => a.projectId === p.id)).toBe(true);
      const rows = await listPosts(scope, { limit: 500 });
      expect(rows.every((r) => r.projectId === p.id && r.targets.every((t) => accs.some((a) => a.id === t.accountId)))).toBe(true);
    }
  });
});

afterAll(async () => {
  if (!dbUp) return;
  await sql.end();
  const { redis } = await import('@/lib/queue');
  redis().disconnect();
});
