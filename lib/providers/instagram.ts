import type { ProviderAdapter, PostMetrics, RemoteComment, RemotePost } from './types';
import type { PostKind } from '@/lib/db/schema';
import { format, subDays } from 'date-fns';
import { ProviderError } from './types';
import { graphFetch, perItem, qs, sleep } from './http';

/**
 * Instagram API with Instagram Login (Business / Creator account).
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 * Media is pulled by Meta from a public URL, so PUBLIC_MEDIA_URL must be reachable from the internet.
 */
export type InstagramCredentials = { accessToken: string; userId: string };

const GRAPH = 'https://graph.instagram.com/v23.0';

async function waitContainer(id: string, token: string) {
  // Video / reels containers are processed asynchronously.
  for (let i = 0; i < 60; i++) {
    const s = await graphFetch<{ status_code: string }>(`${GRAPH}/${id}?${qs({ fields: 'status_code', access_token: token })}`);
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new ProviderError(`Instagram container ${s.status_code}`, false);
    await sleep(5000);
  }
  throw new ProviderError('Instagram: video processing timed out');
}

export const instagramAdapter: ProviderAdapter<InstagramCredentials> = {
  platform: 'instagram',

  async publish(ctx, input) {
    const { accessToken: token, userId } = ctx.credentials;
    const urls = input.mediaUrls;
    if (urls.length === 0) throw new ProviderError('Instagram needs at least one photo or video', false);
    const isVideo = (i: number) => input.media[i]?.mime.startsWith('video/');

    const create = (params: Record<string, string | undefined>) =>
      graphFetch<{ id: string }>(`${GRAPH}/${userId}/media`, {
        form: Object.fromEntries(Object.entries({ ...params, access_token: token }).filter(([, v]) => v !== undefined)) as Record<string, string>,
      });

    let containerId: string;
    if (input.kind === 'story') {
      containerId = (await create({ media_type: 'STORIES', [isVideo(0) ? 'video_url' : 'image_url']: urls[0] })).id;
    } else if (input.kind === 'reel' || (urls.length === 1 && isVideo(0))) {
      containerId = (await create({ media_type: 'REELS', video_url: urls[0], caption: input.text })).id;
    } else if (urls.length === 1) {
      containerId = (await create({ image_url: urls[0], caption: input.text })).id;
    } else {
      const children: string[] = [];
      for (const [i, url] of urls.slice(0, 10).entries()) {
        const child = await create(isVideo(i) ? { media_type: 'VIDEO', video_url: url, is_carousel_item: 'true' } : { image_url: url, is_carousel_item: 'true' });
        children.push(child.id);
      }
      for (const c of children) await waitContainer(c, token);
      containerId = (await create({ media_type: 'CAROUSEL', children: children.join(','), caption: input.text })).id;
    }
    await waitContainer(containerId, token);

    const published = await graphFetch<{ id: string }>(`${GRAPH}/${userId}/media_publish`, {
      form: { creation_id: containerId, access_token: token },
    });
    const info = await graphFetch<{ permalink?: string }>(
      `${GRAPH}/${published.id}?${qs({ fields: 'permalink', access_token: token })}`,
    ).catch(() => ({ permalink: undefined }));
    return { externalId: published.id, url: info.permalink };
  },

  async fetchStats(ctx) {
    const me = await graphFetch<{ followers_count: number }>(
      `${GRAPH}/me?${qs({ fields: 'followers_count,username', access_token: ctx.credentials.accessToken })}`,
    );
    return { followers: me.followers_count };
  },

  async fetchPostMetrics(ctx, externalIds) {
    const out: Record<string, PostMetrics> = {};
    const results = await perItem(externalIds, (id) =>
      graphFetch<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
        `${GRAPH}/${id}/insights?${qs({ metric: 'views,likes,comments,shares', access_token: ctx.credentials.accessToken })}`,
      ),
    );
    for (const [id, res] of results) {
      const v = (name: string) => {
        const m = res.data.find((d) => d.name === name);
        return m?.total_value?.value ?? m?.values?.[0]?.value ?? 0;
      };
      out[id] = { views: v('views'), reactions: v('likes'), comments: v('comments'), shares: v('shares') };
    }
    return out;
  },

  async fetchComments(ctx, postExternalIds) {
    const out: RemoteComment[] = [];
    const results = await perItem(postExternalIds, (mediaId) =>
      graphFetch<{ data: { id: string; text: string; username?: string; timestamp: string }[] }>(
        `${GRAPH}/${mediaId}/comments?${qs({ fields: 'id,text,username,timestamp', limit: 50, access_token: ctx.credentials.accessToken })}`,
      ),
    );
    for (const [mediaId, res] of results) {
      for (const c of res.data) {
        out.push({
          externalId: c.id,
          postExternalId: mediaId,
          authorName: c.username ?? 'instagram user',
          authorHandle: c.username ? `@${c.username}` : undefined,
          text: c.text,
          postedAt: new Date(c.timestamp),
        });
      }
    }
    return out;
  },

  async reply(ctx, comment, text) {
    await graphFetch(`${GRAPH}/${comment.externalId}/replies`, {
      form: { message: text, access_token: ctx.credentials.accessToken },
    });
  },

  async fetchPosts(ctx, { since, limit }) {
    type Media = { id: string; caption?: string; media_type: string; media_product_type?: string; permalink?: string; timestamp: string; like_count?: number; comments_count?: number };
    const out: RemotePost[] = [];
    let url: string | undefined = `${GRAPH}/${ctx.credentials.userId}/media?${qs({
      fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
      limit: 50,
      access_token: ctx.credentials.accessToken,
    })}`;
    while (url && out.length < limit) {
      const page: { data: Media[]; paging?: { next?: string } } = await graphFetch(url);
      for (const m of page.data) {
        const publishedAt = new Date(m.timestamp);
        if (since && publishedAt < since) return out;
        const kind: PostKind = m.media_product_type === 'REELS' || m.media_type === 'VIDEO' ? 'reel' : m.media_product_type === 'STORY' ? 'story' : 'photo';
        out.push({
          externalId: m.id,
          url: m.permalink,
          text: m.caption ?? '',
          kind,
          publishedAt,
          metrics: { views: 0, reactions: m.like_count ?? 0, comments: m.comments_count ?? 0, shares: 0 },
        });
        if (out.length >= limit) break;
      }
      url = page.paging?.next;
    }
    return out;
  },

  /** Instagram keeps daily new-follower counts for 30 days; totals are rebuilt back from today. */
  async fetchFollowerHistory(ctx, days) {
    const span = Math.min(days, 30);
    const { followers } = await instagramAdapter.fetchStats(ctx);
    if (followers === null) return [];
    const res = await graphFetch<{ data: { values: { value: number; end_time: string }[] }[] }>(
      `${GRAPH}/${ctx.credentials.userId}/insights?${qs({
        metric: 'follower_count',
        period: 'day',
        since: Math.floor(subDays(new Date(), span).getTime() / 1000),
        until: Math.floor(Date.now() / 1000),
        access_token: ctx.credentials.accessToken,
      })}`,
    );
    const gains = (res.data[0]?.values ?? []).map((v) => ({ day: format(new Date(v.end_time), 'yyyy-MM-dd'), gain: v.value })).reverse();
    const out: { day: string; followers: number }[] = [];
    let total = followers;
    for (const g of gains) {
      out.push({ day: g.day, followers: total });
      total -= g.gain; // approximate: the API reports new followers, not unfollows
    }
    return out.reverse();
  },

  async refresh(ctx) {
    const exp = ctx.account.tokenExpiresAt;
    // unknown expiry (pasted token) or far from expiring: leave it alone
    if (!exp || exp.getTime() - Date.now() > 7 * 86400_000) return;
    const res = await graphFetch<{ access_token: string; expires_in: number }>(
      `https://graph.instagram.com/refresh_access_token?${qs({ grant_type: 'ig_refresh_token', access_token: ctx.credentials.accessToken })}`,
    );
    await ctx.saveCredentials({ ...ctx.credentials, accessToken: res.access_token }, new Date(Date.now() + res.expires_in * 1000));
  },
};

export const instagramOAuth = {
  ready: () => !!process.env.INSTAGRAM_APP_ID,
  authorize(redirectUri: string, state: string) {
    return { url: `https://www.instagram.com/oauth/authorize?${qs({
      client_id: process.env.INSTAGRAM_APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_insights',
    })}` };
  },
  async exchange(code: string, redirectUri: string, _verifier?: string) {
    const short = await graphFetch<{ access_token: string; user_id: number | string }>('https://api.instagram.com/oauth/access_token', {
      form: {
        client_id: process.env.INSTAGRAM_APP_ID!,
        client_secret: process.env.INSTAGRAM_APP_SECRET!,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      },
    });
    const long = await graphFetch<{ access_token: string; expires_in: number }>(
      `https://graph.instagram.com/access_token?${qs({ grant_type: 'ig_exchange_token', client_secret: process.env.INSTAGRAM_APP_SECRET, access_token: short.access_token })}`,
    );
    const me = await graphFetch<{ user_id?: string; id: string; username: string }>(
      `${GRAPH}/me?${qs({ fields: 'user_id,username', access_token: long.access_token })}`,
    );
    return {
      credentials: { accessToken: long.access_token, userId: String(me.user_id ?? me.id) } satisfies InstagramCredentials,
      handle: `@${me.username}`,
      externalId: String(me.user_id ?? me.id),
      expiresAt: new Date(Date.now() + long.expires_in * 1000),
    };
  },
};
