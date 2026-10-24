import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { cookieSecure } from '@/lib/auth/session';
import { callbackUrl, isOAuthPlatform, OAUTH, OAUTH_ENV } from '@/lib/providers/oauth';

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isOAuthPlatform(platform)) return new Response('unknown platform', { status: 404 });
  if (!OAUTH[platform].ready()) return new Response(`${OAUTH_ENV[platform].join(' / ')} is not set in .env`, { status: 400 });
  const projectId = Number(new URL(req.url).searchParams.get('project'));
  if (!Number.isInteger(projectId) || projectId <= 0) return new Response('project is required', { status: 400 });
  const state = randomBytes(16).toString('hex');
  const { url, verifier } = OAUTH[platform].authorize(callbackUrl(platform), state) as { url: string; verifier?: string };
  // state + project (+ PKCE verifier) travel to the callback in an httpOnly cookie
  (await cookies()).set(`oauth_${platform}`, JSON.stringify({ state, projectId, verifier }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    maxAge: 600,
    path: '/',
  });
  return Response.redirect(url);
}
