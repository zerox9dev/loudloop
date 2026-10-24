import { cookies } from 'next/headers';
import { upsertConnectedAccount } from '@/lib/services/connect';
import { projectById } from '@/lib/projects';
import { callbackUrl, isOAuthPlatform, OAUTH } from '@/lib/providers/oauth';
import { requireAppKeys } from '@/lib/services/app-keys';

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isOAuthPlatform(platform)) return new Response('unknown platform', { status: 404 });
  const url = new URL(req.url);
  const jar = await cookies();
  let saved: { state?: string; projectId?: number; verifier?: string } = {};
  try {
    saved = JSON.parse(jar.get(`oauth_${platform}`)?.value ?? '{}');
  } catch {}
  jar.delete(`oauth_${platform}`);
  const project = saved.projectId ? await projectById(saved.projectId) : null;
  const back = (q: string) => Response.redirect(`${process.env.APP_URL}/${project ? `${project.slug}/account` : ''}?${q}`);
  if (!project) return back('error=project');
  if (url.searchParams.get('error')) return back(`error=${encodeURIComponent(url.searchParams.get('error_description') ?? 'access_denied')}`);
  if (!saved.state || url.searchParams.get('state') !== saved.state) return back('error=state');
  const code = url.searchParams.get('code');
  if (!code) return back('error=no_code');
  try {
    const res = await OAUTH[platform].exchange(await requireAppKeys(platform), code.replace(/#_$/, ''), callbackUrl(platform), saved.verifier);
    await upsertConnectedAccount({ projectId: project.id, platform, handle: res.handle, externalId: res.externalId, credentials: res.credentials, expiresAt: res.expiresAt });
    return back(`connected=${platform}`);
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message)}`);
  }
}
