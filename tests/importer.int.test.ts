import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { and, count, eq } from 'drizzle-orm';
import { db, sql, accounts, comments, posts, postTargets, projects } from '@/lib/db';
import { encryptJson } from '@/lib/crypto';
import { BACKFILL, backfillAccount, importPosts } from '@/lib/services/importer';
import { instagramAdapter } from '@/lib/providers/instagram';
import type { Account } from '@/lib/db/schema';

vi.mock('server-only', () => ({}));

const server = setupServer();
const dbUp = await sql`select 1`.then(() => true, () => false);
const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();

const threadsPage = {
  data: [
    { id: 't3', text: 'свежий', media_type: 'TEXT_POST', permalink: 'https://threads.net/t3', timestamp: day(1) },
    { id: 'rp', text: '', media_type: 'REPOST_FACADE', timestamp: day(2) },
    { id: 't2', text: 'с фото', media_type: 'IMAGE', permalink: 'https://threads.net/t2', timestamp: day(3) },
    { id: 't1', text: 'старый', media_type: 'VIDEO', permalink: 'https://threads.net/t1', timestamp: day(400) },
  ],
};

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());

describe('instagram history (unit)', () => {
  const ctx = { account: { id: 1, tokenExpiresAt: null } as Account, credentials: { accessToken: 't', userId: '7' }, saveCredentials: async () => {} };

  it('follows paging and stops at the since boundary', async () => {
    server.use(
      http.get('https://graph.instagram.com/v23.0/7/media', ({ request }) => {
        const after = new URL(request.url).searchParams.get('after');
        return HttpResponse.json(
          after
            ? { data: [{ id: 'm3', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: day(10), like_count: 3 }, { id: 'old', media_type: 'IMAGE', timestamp: day(90) }] }
            : { data: [{ id: 'm1', caption: 'hi', media_type: 'IMAGE', media_product_type: 'FEED', timestamp: day(1), like_count: 5, comments_count: 2 }], paging: { next: 'https://graph.instagram.com/v23.0/7/media?after=x' } },
        );
      }),
    );
    const res = await instagramAdapter.fetchPosts!(ctx, { since: new Date(Date.now() - 30 * 86400_000), limit: 100 });
    expect(res.map((r) => [r.externalId, r.kind])).toEqual([
      ['m1', 'photo'],
      ['m3', 'reel'],
    ]);
    expect(res[0].metrics).toMatchObject({ reactions: 5, comments: 2 });
  });

  it('rebuilds daily follower totals backwards from today', async () => {
    server.use(
      http.get('https://graph.instagram.com/v23.0/me', () => HttpResponse.json({ followers_count: 100 })),
      http.get('https://graph.instagram.com/v23.0/7/insights', () =>
        HttpResponse.json({ data: [{ values: [{ value: 5, end_time: '2026-10-21T07:00:00+0000' }, { value: 3, end_time: '2026-10-22T07:00:00+0000' }] }] }),
      ),
    );
    const rows = await instagramAdapter.fetchFollowerHistory!(ctx, 30);
    expect(rows.map((r) => r.followers)).toEqual([97, 100]);
  });
});

describe.skipIf(!dbUp)('importPosts (integration)', () => {
  let account: Account;
  afterAll(async () => {
    if (account) {
      const ids = (await db.select({ id: postTargets.postId }).from(postTargets).where(eq(postTargets.accountId, account.id))).map((r) => r.id);
      for (const id of ids) await db.delete(posts).where(eq(posts.id, id));
      await db.delete(accounts).where(eq(accounts.id, account.id));
      await db.delete(projects).where(eq(projects.id, account.projectId));
    }
    server.close();
    await sql.end();
  });

  it('creates imported posts once, then only refreshes them; skips reposts and out-of-range posts', async () => {
    // own project without a brief: the running worker's autofill never touches it
    const [project] = await db.insert(projects).values({ slug: `import-test-${Date.now()}`, name: 'import test' }).returning();
    [account] = await db
      .insert(accounts)
      .values({ projectId: project.id, platform: 'threads', handle: '@import-test', externalId: `import-test-${Date.now()}`, status: 'connected', credentials: encryptJson({ accessToken: 'tok', userId: '42' }) })
      .returning();
    server.use(
      http.get('https://graph.threads.net/v1.0/42/threads', () => HttpResponse.json(threadsPage)),
      http.get('https://graph.threads.net/v1.0/:id/replies', ({ params }) =>
        HttpResponse.json({ data: params.id === 't2' ? [{ id: 'c1', text: 'класс', username: 'ann', timestamp: day(3) }] : [] }),
      ),
      http.get('https://graph.threads.net/v1.0/:id/insights', ({ params }) =>
        HttpResponse.json({ data: [{ name: 'views', total_value: { value: params.id === 't2' ? 70 : 10 } }, { name: 'likes', total_value: { value: 4 } }] }),
      ),
    );

    const first = await importPosts(account, { days: 30, limit: 100, withComments: true });
    expect(first).toMatchObject({ created: 2, updated: 0, comments: 1 });

    const rows = await db
      .select({ text: posts.text, kind: posts.kind, imported: posts.imported, projectId: posts.projectId, url: postTargets.url, views: postTargets.views, reactions: postTargets.reactions })
      .from(postTargets)
      .innerJoin(posts, eq(posts.id, postTargets.postId))
      .where(eq(postTargets.accountId, account.id));
    expect(rows.map((r) => [r.text, r.kind, r.imported, r.projectId === project.id]).sort()).toEqual([
      ['с фото', 'photo', true, true],
      ['свежий', 'post', true, true],
    ]);
    // Threads listings carry no counters: they are fetched once at import
    expect(rows.map((r) => [r.text, r.views, r.reactions]).sort()).toEqual([
      ['с фото', 70, 4],
      ['свежий', 10, 4],
    ]);

    const second = await importPosts(account, { days: 30, limit: 100, withComments: true });
    expect(second).toMatchObject({ created: 0, updated: 2 });
    const [{ n }] = await db.select({ n: count() }).from(postTargets).where(eq(postTargets.accountId, account.id));
    expect(n).toBe(2);

    // a 3-day-old comment on first import is fresh enough to stay unread
    const [c] = await db.select().from(comments).where(and(eq(comments.accountId, account.id), eq(comments.externalId, 'c1')));
    expect(c.isRead).toBe(false);
  });

  it('a failed backfill is rethrown for the queue, stays unfinished and records why', async () => {
    server.use(http.get('https://graph.threads.net/v1.0/42/threads', () => HttpResponse.json({ error: { message: 'Session expired', code: 190 } }, { status: 400 })));
    await expect(backfillAccount(account.id)).rejects.toThrow('Session expired');
    const [a] = await db.select().from(accounts).where(eq(accounts.id, account.id));
    expect(a.historyImportedAt).toBeNull();
    expect(a.historyError).toBe('post history: Session expired');
  });

  it('re-import also fetches comments for posts it already knew', async () => {
    server.use(
      http.get('https://graph.threads.net/v1.0/42/threads', () => HttpResponse.json(threadsPage)),
      http.get('https://graph.threads.net/v1.0/:id/replies', ({ params }) =>
        HttpResponse.json({ data: params.id === 't3' ? [{ id: 'c-late', text: 'позже', username: 'bob', timestamp: day(1) }] : [] }),
      ),
    );
    const res = await importPosts(account, { days: 30, limit: 100, withComments: true });
    expect(res).toMatchObject({ created: 0, comments: 1 });
  });

  it('a full backfill has no date cutoff and refreshes counters of known posts', async () => {
    server.use(
      http.get('https://graph.threads.net/v1.0/42/threads', () => HttpResponse.json(threadsPage)),
      http.get('https://graph.threads.net/v1.0/:id/insights', () => HttpResponse.json({ data: [{ name: 'views', total_value: { value: 500 } }] })),
    );
    const res = await importPosts(account, { ...BACKFILL, withComments: false });
    // only the 400-day-old post is new
    expect(res).toMatchObject({ created: 1, updated: 2 });
    const views = await db.select({ views: postTargets.views }).from(postTargets).where(eq(postTargets.accountId, account.id));
    expect(views.map((v) => v.views)).toEqual([500, 500, 500]);
  });
});
