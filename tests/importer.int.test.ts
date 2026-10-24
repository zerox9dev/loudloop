import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { and, count, eq } from 'drizzle-orm';
import { db, sql, accounts, comments, posts, postTargets, profileViews, projects } from '@/lib/db';
import { encryptJson } from '@/lib/crypto';
import { BACKFILL, backfillAccount, importPosts, importViewHistory } from '@/lib/services/importer';
import { instagramAdapter } from '@/lib/providers/instagram';
import { threadsAdapter } from '@/lib/providers/threads';
import type { Account } from '@/lib/db/schema';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { mediaFile } from '@/lib/media';

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

describe('threads view history (unit)', () => {
  const ctx = { account: { id: 1, tokenExpiresAt: null } as Account, credentials: { accessToken: 't', userId: '42' }, saveCredentials: async () => {} };

  it('walks 90-day windows back to the two-year limit and dates each value by the day it closes', async () => {
    const windows: number[] = [];
    server.use(
      http.get('https://graph.threads.net/v1.0/42/threads_insights', ({ request }) => {
        const until = Number(new URL(request.url).searchParams.get('until'));
        windows.push(until - Number(new URL(request.url).searchParams.get('since')));
        const end = new Date(until * 1000).toISOString().slice(0, 10);
        return HttpResponse.json({ data: [{ name: 'views', values: [{ value: windows.length, end_time: `${end}T07:00:00+0000` }] }] });
      }),
    );
    const rows = await threadsAdapter.fetchViewHistory!(ctx, null);
    expect(windows).toHaveLength(9); // 729 days / 90
    expect(Math.max(...windows)).toBeLessThanOrEqual(90 * 86400);
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    expect(rows.at(-1)).toEqual({ day: yesterday, views: 9 });
    expect(rows.map((r) => r.day)).toEqual([...rows.map((r) => r.day)].sort());
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

  it('view history is upserted: a day still growing gets the later value', async () => {
    const reply = (v: number) => HttpResponse.json({ data: [{ name: 'views', values: [{ value: 3, end_time: '2026-10-21T07:00:00+0000' }, { value: v, end_time: '2026-10-22T07:00:00+0000' }] }] });
    server.use(http.get('https://graph.threads.net/v1.0/42/threads_insights', () => reply(5)));
    await importViewHistory(account, new Date(Date.now() - 3 * 86400_000));
    server.use(http.get('https://graph.threads.net/v1.0/42/threads_insights', () => reply(8)));
    await importViewHistory(account, new Date(Date.now() - 3 * 86400_000));
    const rows = await db.select({ day: profileViews.day, views: profileViews.views }).from(profileViews).where(eq(profileViews.accountId, account.id)).orderBy(profileViews.day);
    expect(rows).toEqual([
      { day: '2026-10-20', views: 3 },
      { day: '2026-10-21', views: 8 },
    ]);
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

  it('copies post images from the CDN into storage, once', async () => {
    const withImage = { data: threadsPage.data.map((t) => (t.id === 't2' ? { ...t, media_url: 'https://cdn.example/t2.jpg' } : t)) };
    let downloads = 0;
    server.use(
      http.get('https://graph.threads.net/v1.0/42/threads', () => HttpResponse.json(withImage)),
      http.get('https://graph.threads.net/v1.0/:id/insights', () => HttpResponse.json({ data: [] })),
      http.get('https://cdn.example/t2.jpg', () => {
        downloads++;
        return new HttpResponse(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } });
      }),
    );
    const res = await importPosts(account, { ...BACKFILL, withComments: false });
    expect(res.mediaFiles).toBe(1);
    const [row] = await db
      .select({ media: posts.media })
      .from(postTargets)
      .innerJoin(posts, eq(posts.id, postTargets.postId))
      .where(and(eq(postTargets.accountId, account.id), eq(postTargets.externalId, 't2')));
    expect(row.media).toHaveLength(1);
    expect(row.media[0]).toMatchObject({ mime: 'image/jpeg' });
    expect(existsSync(mediaFile(row.media[0].path))).toBe(true);
    await rm(mediaFile(row.media[0].path));

    // already has media: not downloaded again
    await importPosts(account, { ...BACKFILL, withComments: false });
    expect(downloads).toBe(1);
  });
});
