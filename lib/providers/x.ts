import { readFile } from 'node:fs/promises';
import { TwitterApi, ApiResponseError } from 'twitter-api-v2';
import type { ProviderAdapter, ProviderContext, PostMetrics, RemoteComment, RemotePost } from './types';
import { ProviderError } from './types';

/**
 * X (Twitter) via twitter-api-v2.
 * Default: OAuth 2.0 user context (PKCE, "Connect with X"), tokens refreshed automatically.
 * Legacy: OAuth 1.0a user tokens pasted by hand (app keys X_API_KEY / X_API_SECRET).
 * Free tier: posting + /users/me only. Metrics and mentions need Basic tier.
 */
type XOAuth2 = { accessToken: string; refreshToken: string; expiresAt: number; userId?: string; username?: string };
type XOAuth1 = { accessToken: string; accessSecret: string; userId?: string; username?: string };
export type XCredentials = XOAuth2 | XOAuth1;

const isOAuth2 = (c: XCredentials): c is XOAuth2 => 'refreshToken' in c;

export const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write'];

function appClient() {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId) throw new ProviderError('X_CLIENT_ID is not set', false);
  return new TwitterApi({ clientId, clientSecret });
}

function client(ctx: ProviderContext<XCredentials>) {
  const c = ctx.credentials;
  if (isOAuth2(c)) return new TwitterApi(c.accessToken);
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  if (!appKey || !appSecret) throw new ProviderError('X_API_KEY / X_API_SECRET are not set', false);
  return new TwitterApi({ appKey, appSecret, accessToken: c.accessToken, accessSecret: c.accessSecret });
}

function wrap(e: unknown): never {
  if (e instanceof ApiResponseError) {
    const retryable = e.rateLimitError || (e.code ?? 0) >= 500;
    throw new ProviderError(`X: ${e.data?.detail ?? e.data?.title ?? e.message}`, retryable);
  }
  throw e;
}

async function me(ctx: ProviderContext<XCredentials>) {
  if (ctx.credentials.userId && ctx.credentials.username) return { id: ctx.credentials.userId, username: ctx.credentials.username };
  const { data } = await client(ctx).v2.me().catch(wrap);
  await ctx.saveCredentials({ ...ctx.credentials, userId: data.id, username: data.username });
  return data;
}

export const xAdapter: ProviderAdapter<XCredentials> = {
  platform: 'x',

  async publish(ctx, input) {
    if (input.kind === 'story') throw new ProviderError('X does not support stories', false);
    const c = client(ctx);
    try {
      const mediaIds: string[] = [];
      for (const [i, file] of input.mediaFiles.slice(0, 4).entries()) {
        const mime = input.media[i].mime;
        mediaIds.push(
          await c.v2.uploadMedia(await readFile(file), {
            media_type: mime as never,
            media_category: mime.startsWith('video/') ? 'tweet_video' : 'tweet_image',
          }),
        );
      }
      const { data } = await c.v2.tweet(input.text, mediaIds.length ? { media: { media_ids: mediaIds as [string] } } : {});
      const user = await me(ctx).catch(() => null);
      return { externalId: data.id, url: user ? `https://x.com/${user.username}/status/${data.id}` : undefined };
    } catch (e) {
      wrap(e);
    }
  },

  async fetchStats(ctx) {
    const { data } = await client(ctx).v2.me({ 'user.fields': ['public_metrics'] }).catch(wrap);
    return { followers: data.public_metrics?.followers_count ?? 0 };
  },

  async fetchPostMetrics(ctx, externalIds) {
    const out: Record<string, PostMetrics> = {};
    for (let i = 0; i < externalIds.length; i += 100) {
      const res = await client(ctx)
        .v2.tweets(externalIds.slice(i, i + 100), { 'tweet.fields': ['public_metrics'] })
        .catch(wrap);
      for (const t of res.data ?? []) {
        const m = t.public_metrics;
        out[t.id] = {
          views: m?.impression_count ?? 0,
          reactions: m?.like_count ?? 0,
          comments: m?.reply_count ?? 0,
          shares: (m?.retweet_count ?? 0) + (m?.quote_count ?? 0),
        };
      }
    }
    return out;
  },

  async fetchComments(ctx, postExternalIds) {
    const user = await me(ctx);
    const known = new Set(postExternalIds);
    const timeline = await client(ctx)
      .v2.userMentionTimeline(user.id, {
        max_results: 50,
        'tweet.fields': ['created_at', 'conversation_id', 'author_id'],
        expansions: ['author_id'],
        'user.fields': ['username', 'name'],
      })
      .catch(wrap);
    const out: RemoteComment[] = [];
    for (const t of timeline.tweets) {
      const author = timeline.includes.author(t);
      out.push({
        externalId: t.id,
        postExternalId: t.conversation_id && known.has(t.conversation_id) ? t.conversation_id : undefined,
        authorName: author?.name ?? 'X user',
        authorHandle: author ? `@${author.username}` : undefined,
        text: t.text,
        postedAt: t.created_at ? new Date(t.created_at) : new Date(),
      });
    }
    return out;
  },

  /** Needs the Basic tier (Free has no read access); errors surface in the account status. */
  async fetchPosts(ctx, { since, limit }) {
    const user = await me(ctx);
    const timeline = await client(ctx)
      .v2.userTimeline(user.id, {
        max_results: 100,
        exclude: ['replies', 'retweets'],
        'tweet.fields': ['created_at', 'public_metrics', 'attachments'],
        ...(since ? { start_time: since.toISOString() } : {}),
      })
      .catch(wrap);
    const out: RemotePost[] = [];
    try {
      for await (const t of timeline) {
        const m = t.public_metrics;
        out.push({
          externalId: t.id,
          url: `https://x.com/${user.username}/status/${t.id}`,
          text: t.text,
          kind: t.attachments?.media_keys?.length ? 'photo' : 'post',
          publishedAt: t.created_at ? new Date(t.created_at) : new Date(),
          metrics: { views: m?.impression_count ?? 0, reactions: m?.like_count ?? 0, comments: m?.reply_count ?? 0, shares: (m?.retweet_count ?? 0) + (m?.quote_count ?? 0) },
        });
        if (out.length >= limit) break;
      }
    } catch (e) {
      wrap(e); // later pages are fetched by the paginator: map their errors too
    }
    return out;
  },

  async reply(ctx, comment, text) {
    await client(ctx).v2.reply(text, comment.externalId).catch(wrap);
  },

  /** OAuth 2.0 access tokens live 2 hours: refresh shortly before they expire. */
  async refresh(ctx) {
    const c = ctx.credentials;
    if (!isOAuth2(c) || c.expiresAt - Date.now() > 5 * 60_000) return;
    const res = await appClient().refreshOAuth2Token(c.refreshToken).catch(wrap);
    const next = { ...c, accessToken: res.accessToken, refreshToken: res.refreshToken ?? c.refreshToken, expiresAt: Date.now() + res.expiresIn * 1000 };
    // the old refresh token is spent now: losing the new one means a manual reconnect, so retry the write
    for (let attempt = 1; ; attempt++) {
      try {
        await ctx.saveCredentials(next);
        return;
      } catch (e) {
        if (attempt >= 5) throw e;
        await new Promise((r) => setTimeout(r, attempt * 500));
      }
    }
  },
};

export const xOAuth = {
  ready: () => !!process.env.X_CLIENT_ID,
  authorize(redirectUri: string, state: string) {
    const link = appClient().generateOAuth2AuthLink(redirectUri, { scope: X_SCOPES, state });
    return { url: link.url, verifier: link.codeVerifier };
  },
  async exchange(code: string, redirectUri: string, verifier?: string) {
    if (!verifier) throw new Error('missing PKCE verifier');
    const res = await appClient().loginWithOAuth2({ code, codeVerifier: verifier, redirectUri }).catch(wrap);
    // without offline.access there is no refresh token and the account would die in 2 hours
    if (!res.refreshToken) throw new Error('X returned no refresh token — enable offline.access for the app');
    const { data } = await res.client.v2.me().catch(wrap);
    return {
      credentials: {
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        expiresAt: Date.now() + res.expiresIn * 1000,
        userId: data.id,
        username: data.username,
      } satisfies XOAuth2,
      handle: `@${data.username}`,
      externalId: data.id,
      expiresAt: null, // refreshed automatically
    };
  },
};
