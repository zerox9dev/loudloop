import { readFile } from 'node:fs/promises';
import type { AppKeys } from '@/lib/services/app-keys';
import type { ProviderAdapter } from './types';
import { ProviderError } from './types';
import { graphFetch, qs } from './http';
import { escapeLittleText } from '@/lib/text';

/**
 * LinkedIn member profile via the versioned Posts API ("Share on LinkedIn" product, w_member_social).
 * Docs: https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api
 * Follower counts, post analytics and comments for members need the Community Management API
 * (partner approval), so those are reported as unavailable rather than failing every sync.
 */
export type LinkedinCredentials = { accessToken: string; personUrn: string };

const API = 'https://api.linkedin.com';
const version = () => process.env.LINKEDIN_API_VERSION || '202608';

function headers(token: string, json = true): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': version(),
    'X-Restli-Protocol-Version': '2.0.0',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function liFetch(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ProviderError(`LinkedIn: ${body.message ?? `HTTP ${res.status}`}`, res.status >= 500 || res.status === 429);
  }
  return res;
}

export { escapeLittleText };

async function uploadImage(token: string, owner: string, file: string) {
  const init = await liFetch(`${API}/rest/images?action=initializeUpload`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  const { value } = (await init.json()) as { value: { uploadUrl: string; image: string } };
  await liFetch(value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: new Uint8Array(await readFile(file)) });
  return value.image;
}

export const linkedinAdapter: ProviderAdapter<LinkedinCredentials> = {
  platform: 'linkedin',

  async publish(ctx, input) {
    const { accessToken: token, personUrn } = ctx.credentials;
    if (input.kind === 'story' || input.kind === 'reel') throw new ProviderError('LinkedIn: only posts and photos are supported', false);
    if (input.media.some((m) => !m.mime.startsWith('image/'))) throw new ProviderError('LinkedIn: video is not supported yet', false);

    const images: string[] = [];
    for (const file of input.mediaFiles.slice(0, 20)) images.push(await uploadImage(token, personUrn, file));

    const body: Record<string, unknown> = {
      author: personUrn,
      commentary: escapeLittleText(input.text),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };
    if (images.length === 1) body.content = { media: { id: images[0] } };
    if (images.length > 1) body.content = { multiImage: { images: images.map((id) => ({ id })) } };

    const res = await liFetch(`${API}/rest/posts`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
    const urn = res.headers.get('x-restli-id');
    if (!urn) throw new ProviderError('LinkedIn did not return a post id', false);
    return { externalId: urn, url: `https://www.linkedin.com/feed/update/${urn}/` };
  },

  async fetchStats() {
    return { followers: null };
  },

  async fetchPostMetrics() {
    return {};
  },

  async fetchComments() {
    return [];
  },

  async reply() {
    throw new ProviderError('LinkedIn: replying to comments requires the Community Management API', false);
  },
};

export const linkedinOAuth = {
  authorize(keys: AppKeys, redirectUri: string, state: string) {
    return { url: `https://www.linkedin.com/oauth/v2/authorization?${qs({
      response_type: 'code',
      client_id: keys.clientId,
      redirect_uri: redirectUri,
      state,
      scope: 'openid profile w_member_social',
    })}` };
  },
  async exchange(keys: AppKeys, code: string, redirectUri: string, _verifier?: string) {
    const token = await graphFetch<{ access_token: string; expires_in: number }>('https://www.linkedin.com/oauth/v2/accessToken', {
      form: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: keys.clientId,
        client_secret: keys.secret,
      },
    });
    const me = await linkedinMe(token.access_token);
    return {
      credentials: { accessToken: token.access_token, personUrn: me.urn } satisfies LinkedinCredentials,
      handle: me.name,
      externalId: me.sub,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    };
  },
};

export async function linkedinMe(token: string) {
  const me = await graphFetch<{ sub: string; name?: string }>(`${API}/v2/userinfo`, { headers: { Authorization: `Bearer ${token}` } });
  return { sub: me.sub, name: me.name ?? 'LinkedIn', urn: `urn:li:person:${me.sub}` };
}
