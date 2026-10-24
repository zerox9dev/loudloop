import type { ProviderAdapter, PostMetrics, RemoteComment, RemotePost } from './types';
import type { PostKind } from '@/lib/db/schema';
import { ProviderError } from './types';
import { graphFetch, perItem, qs, sleep } from './http';

/**
 * Threads API. Docs: https://developers.facebook.com/docs/threads
 * Like Instagram, media is fetched by Meta from PUBLIC_MEDIA_URL.
 */
export type ThreadsCredentials = { accessToken: string; userId: string };

const GRAPH = 'https://graph.threads.net/v1.0';

async function createAndPublish(token: string, userId: string, params: Record<string, string>) {
  const container = await graphFetch<{ id: string }>(`${GRAPH}/${userId}/threads`, {
    form: { ...params, access_token: token },
  });
  // Meta recommends ~30s for media containers; text is immediate.
  if (params.media_type !== 'TEXT') {
    let finished = false;
    for (let i = 0; i < 30; i++) {
      const s = await graphFetch<{ status: string; error_message?: string }>(
        `${GRAPH}/${container.id}?${qs({ fields: 'status,error_message', access_token: token })}`,
      );
      if (s.status === 'FINISHED') {
        finished = true;
        break;
      }
      if (s.status === 'ERROR') throw new ProviderError(`Threads: ${s.error_message ?? 'media error'}`, false);
      if (i < 29) await sleep(3000);
    }
    if (!finished) throw new ProviderError('Threads: media is still processing, will retry', true);
  }
  return graphFetch<{ id: string }>(`${GRAPH}/${userId}/threads_publish`, {
    form: { creation_id: container.id, access_token: token },
  });
}

export const threadsAdapter: ProviderAdapter<ThreadsCredentials> = {
  platform: 'threads',

  async publish(ctx, input) {
    const { accessToken: token, userId } = ctx.credentials;
    if (input.kind === 'story') throw new ProviderError('Threads does not support stories', false);
    const urls = input.mediaUrls;
    const isVideo = (i: number) => input.media[i]?.mime.startsWith('video/');

    let published: { id: string };
    if (urls.length === 0) {
      published = await createAndPublish(token, userId, { media_type: 'TEXT', text: input.text });
    } else if (urls.length === 1) {
      published = await createAndPublish(token, userId, isVideo(0)
        ? { media_type: 'VIDEO', video_url: urls[0], text: input.text }
        : { media_type: 'IMAGE', image_url: urls[0], text: input.text });
    } else {
      const children: string[] = [];
      for (const [i, url] of urls.slice(0, 20).entries()) {
        const c = await graphFetch<{ id: string }>(`${GRAPH}/${userId}/threads`, {
          form: {
            ...(isVideo(i) ? { media_type: 'VIDEO', video_url: url } : { media_type: 'IMAGE', image_url: url }),
            is_carousel_item: 'true',
            access_token: token,
          },
        });
        children.push(c.id);
      }
      await sleep(5000);
      published = await createAndPublish(token, userId, { media_type: 'CAROUSEL', children: children.join(','), text: input.text });
    }
    const info = await graphFetch<{ permalink?: string }>(
      `${GRAPH}/${published.id}?${qs({ fields: 'permalink', access_token: token })}`,
    ).catch(() => ({ permalink: undefined }));
    return { externalId: published.id, url: info.permalink };
  },

  async fetchStats(ctx) {
    const res = await graphFetch<{ data: { name: string; total_value?: { value: number } }[] }>(
      `${GRAPH}/${ctx.credentials.userId}/threads_insights?${qs({ metric: 'followers_count', access_token: ctx.credentials.accessToken })}`,
    );
    return { followers: res.data.find((d) => d.name === 'followers_count')?.total_value?.value ?? 0 };
  },

  async fetchPostMetrics(ctx, externalIds) {
    const out: Record<string, PostMetrics> = {};
    const results = await perItem(externalIds, (id) =>
      graphFetch<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
        `${GRAPH}/${id}/insights?${qs({ metric: 'views,likes,replies,reposts,quotes', access_token: ctx.credentials.accessToken })}`,
      ),
    );
    for (const [id, res] of results) {
      const v = (name: string) => {
        const m = res.data.find((d) => d.name === name);
        return m?.total_value?.value ?? m?.values?.[0]?.value ?? 0;
      };
      out[id] = { views: v('views'), reactions: v('likes'), comments: v('replies'), shares: v('reposts') + v('quotes') };
    }
    return out;
  },

  async fetchComments(ctx, postExternalIds) {
    const out: RemoteComment[] = [];
    const results = await perItem(postExternalIds, (mediaId) =>
      graphFetch<{ data: { id: string; text?: string; username?: string; timestamp: string }[] }>(
        `${GRAPH}/${mediaId}/replies?${qs({ fields: 'id,text,username,timestamp', access_token: ctx.credentials.accessToken })}`,
      ),
    );
    for (const [mediaId, res] of results) {
      for (const c of res.data) {
        out.push({
          externalId: c.id,
          postExternalId: mediaId,
          authorName: c.username ?? 'threads user',
          authorHandle: c.username ? `@${c.username}` : undefined,
          text: c.text ?? '',
          postedAt: new Date(c.timestamp),
        });
      }
    }
    return out;
  },

  async reply(ctx, comment, text) {
    await createAndPublish(ctx.credentials.accessToken, ctx.credentials.userId, {
      media_type: 'TEXT',
      text,
      reply_to_id: comment.externalId,
    });
  },

  async fetchPosts(ctx, { since, limit }) {
    type Item = { id: string; text?: string; media_type: string; permalink?: string; timestamp: string };
    const out: RemotePost[] = [];
    let url: string | undefined = `${GRAPH}/${ctx.credentials.userId}/threads?${qs({
      fields: 'id,text,media_type,permalink,timestamp',
      limit: 50,
      access_token: ctx.credentials.accessToken,
    })}`;
    while (url && out.length < limit) {
      const page: { data: Item[]; paging?: { next?: string } } = await graphFetch(url);
      for (const t of page.data) {
        const publishedAt = new Date(t.timestamp);
        if (since && publishedAt < since) return out;
        if (t.media_type === 'REPOST_FACADE') continue; // reposts of other people's threads
        const kind: PostKind = t.media_type === 'VIDEO' ? 'reel' : t.media_type === 'IMAGE' || t.media_type === 'CAROUSEL_ALBUM' ? 'photo' : 'post';
        out.push({ externalId: t.id, url: t.permalink, text: t.text ?? '', kind, publishedAt });
        if (out.length >= limit) break;
      }
      url = page.paging?.next;
    }
    return out;
  },

  async refresh(ctx) {
    const exp = ctx.account.tokenExpiresAt;
    // unknown expiry (pasted token) or far from expiring: leave it alone
    if (!exp || exp.getTime() - Date.now() > 7 * 86400_000) return;
    const res = await graphFetch<{ access_token: string; expires_in: number }>(
      `https://graph.threads.net/refresh_access_token?${qs({ grant_type: 'th_refresh_token', access_token: ctx.credentials.accessToken })}`,
    );
    await ctx.saveCredentials({ ...ctx.credentials, accessToken: res.access_token }, new Date(Date.now() + res.expires_in * 1000));
  },
};

export const threadsOAuth = {
  ready: () => !!process.env.THREADS_APP_ID,
  authorize(redirectUri: string, state: string) {
    return { url: `https://threads.net/oauth/authorize?${qs({
      client_id: process.env.THREADS_APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: 'threads_basic,threads_content_publish,threads_manage_insights,threads_manage_replies,threads_read_replies',
    })}` };
  },
  async exchange(code: string, redirectUri: string, _verifier?: string) {
    const short = await graphFetch<{ access_token: string; user_id: number | string }>('https://graph.threads.net/oauth/access_token', {
      form: {
        client_id: process.env.THREADS_APP_ID!,
        client_secret: process.env.THREADS_APP_SECRET!,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      },
    });
    const long = await graphFetch<{ access_token: string; expires_in: number }>(
      `https://graph.threads.net/access_token?${qs({ grant_type: 'th_exchange_token', client_secret: process.env.THREADS_APP_SECRET, access_token: short.access_token })}`,
    );
    const me = await graphFetch<{ id: string; username: string }>(
      `${GRAPH}/me?${qs({ fields: 'id,username', access_token: long.access_token })}`,
    );
    return {
      credentials: { accessToken: long.access_token, userId: me.id } satisfies ThreadsCredentials,
      handle: `@${me.username}`,
      externalId: me.id,
      expiresAt: new Date(Date.now() + long.expires_in * 1000),
    };
  },
};
