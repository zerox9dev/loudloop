import { ruIssues } from './helpers/i18n';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { escapeLittleText, linkedinAdapter, type LinkedinCredentials } from '@/lib/providers/linkedin';
import { validateCompose } from '@/lib/services/validate';
import type { ProviderContext } from '@/lib/providers/types';
import type { Account } from '@/lib/db/schema';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ctx: ProviderContext<LinkedinCredentials> = {
  account: { id: 1, tokenExpiresAt: null } as Account,
  credentials: { accessToken: 'tok', personUrn: 'urn:li:person:abc' },
  saveCredentials: async () => {},
};
const input = { kind: 'post' as const, text: 'Hello (world) #tag', media: [], mediaUrls: [], mediaFiles: [] };

describe('linkedin adapter', () => {
  it('escapes little-text reserved characters', () => {
    expect(escapeLittleText('a (b) #c @d *e_')).toBe('a \\(b\\) \\#c \\@d \\*e\\_');
  });

  it('publishes a text post with versioned headers and returns the feed URL', async () => {
    let seen: { headers: Headers; body: Record<string, unknown> } | null = null;
    server.use(
      http.post('https://api.linkedin.com/rest/posts', async ({ request }) => {
        seen = { headers: request.headers, body: (await request.json()) as Record<string, unknown> };
        return new HttpResponse(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:123' } });
      }),
    );
    const res = await linkedinAdapter.publish(ctx, input);
    expect(res).toEqual({ externalId: 'urn:li:share:123', url: 'https://www.linkedin.com/feed/update/urn:li:share:123/' });
    expect(seen!.headers.get('linkedin-version')).toMatch(/^\d{6}$/);
    expect(seen!.body).toMatchObject({ author: 'urn:li:person:abc', commentary: 'Hello \\(world\\) \\#tag', visibility: 'PUBLIC' });
  });

  it('maps 401 to a non-retryable error', async () => {
    server.use(http.post('https://api.linkedin.com/rest/posts', () => HttpResponse.json({ message: 'Invalid access token' }, { status: 401 })));
    const err = await linkedinAdapter.publish(ctx, input).catch((e) => e);
    expect(err.message).toBe('LinkedIn: Invalid access token');
    expect(err.retryable).toBe(false);
  });

  it('reports followers as unavailable instead of failing sync', async () => {
    await expect(linkedinAdapter.fetchStats(ctx)).resolves.toEqual({ followers: null });
  });

  it('composer rejects reels and over-long text for LinkedIn', () => {
    expect(ruIssues(validateCompose({ kind: 'reel', text: 'x', media: [{ path: 'a.mp4', mime: 'video/mp4' }], platforms: ['linkedin'] }))).toContain('LinkedIn: формат «Рилс» не поддерживается');
    expect(ruIssues(validateCompose({ kind: 'post', text: 'x'.repeat(3001), media: [], platforms: ['linkedin'] }))).toEqual(['LinkedIn: текст длиннее 3000 символов (3001)']);
  });
});
