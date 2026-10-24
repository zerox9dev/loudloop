import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { threadsAdapter, type ThreadsCredentials } from '@/lib/providers/threads';
import { instagramAdapter, type InstagramCredentials } from '@/lib/providers/instagram';
import { ProviderError, type ProviderContext } from '@/lib/providers/types';
import type { Account } from '@/lib/db/schema';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function ctx<C>(credentials: C): ProviderContext<C> {
  return { account: { id: 1, tokenExpiresAt: null } as Account, credentials, saveCredentials: async () => {} };
}

const input = { kind: 'post' as const, text: 'hello', media: [], mediaUrls: [], mediaFiles: [] };

describe('threads adapter', () => {
  const c = ctx<ThreadsCredentials>({ accessToken: 'tok', userId: '42' });

  it('publishes text via container → publish → permalink', async () => {
    const calls: string[] = [];
    server.use(
      http.post('https://graph.threads.net/v1.0/42/threads', async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        calls.push(`create:${body.get('media_type')}:${body.get('text')}`);
        return HttpResponse.json({ id: 'c1' });
      }),
      http.post('https://graph.threads.net/v1.0/42/threads_publish', () => HttpResponse.json({ id: 'm1' })),
      http.get('https://graph.threads.net/v1.0/m1', () => HttpResponse.json({ permalink: 'https://threads.net/@me/post/m1' })),
    );
    await expect(threadsAdapter.publish(c, input)).resolves.toEqual({ externalId: 'm1', url: 'https://threads.net/@me/post/m1' });
    expect(calls).toEqual(['create:TEXT:hello']);
  });

  it('reads followers from threads_insights', async () => {
    server.use(http.get('https://graph.threads.net/v1.0/42/threads_insights', () => HttpResponse.json({ data: [{ name: 'followers_count', total_value: { value: 3500 } }] })));
    await expect(threadsAdapter.fetchStats(c)).resolves.toEqual({ followers: 3500 });
  });

  it('maps API errors to non-retryable ProviderError on 400', async () => {
    server.use(http.post('https://graph.threads.net/v1.0/42/threads', () => HttpResponse.json({ error: { message: 'Invalid token', code: 190 } }, { status: 400 })));
    const err = await threadsAdapter.publish(c, input).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).toBe('Invalid token');
    expect(err.retryable).toBe(false);
  });

  it('refuses stories', async () => {
    await expect(threadsAdapter.publish(c, { ...input, kind: 'story' })).rejects.toThrow(/stories/);
  });
});

describe('instagram adapter', () => {
  const c = ctx<InstagramCredentials>({ accessToken: 'tok', userId: '7' });

  it('requires media', async () => {
    await expect(instagramAdapter.publish(c, input)).rejects.toThrow(/photo or video/);
  });

  it('publishes a single image', async () => {
    server.use(
      http.post('https://graph.instagram.com/v23.0/7/media', () => HttpResponse.json({ id: 'cont' })),
      http.get('https://graph.instagram.com/v23.0/cont', () => HttpResponse.json({ status_code: 'FINISHED' })),
      http.post('https://graph.instagram.com/v23.0/7/media_publish', () => HttpResponse.json({ id: 'ig1' })),
      http.get('https://graph.instagram.com/v23.0/ig1', () => HttpResponse.json({ permalink: 'https://instagram.com/p/x' })),
    );
    const res = await instagramAdapter.publish(c, { ...input, kind: 'photo', media: [{ path: 'a.jpg', mime: 'image/jpeg' }], mediaUrls: ['https://cdn/a.jpg'] });
    expect(res).toEqual({ externalId: 'ig1', url: 'https://instagram.com/p/x' });
  });

  it('parses post insights', async () => {
    server.use(
      http.get('https://graph.instagram.com/v23.0/ig1/insights', () =>
        HttpResponse.json({ data: [{ name: 'views', total_value: { value: 900 } }, { name: 'likes', values: [{ value: 40 }] }, { name: 'comments', total_value: { value: 3 } }, { name: 'shares', total_value: { value: 1 } }] }),
      ),
    );
    await expect(instagramAdapter.fetchPostMetrics(c, ['ig1'])).resolves.toEqual({ ig1: { views: 900, reactions: 40, comments: 3, shares: 1 } });
  });
});
