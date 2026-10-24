import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth/session';

const PUBLIC = ['/login', '/share', '/media', '/l', '/api/health'];
const isPublic = (path: string) => PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  const token = request.cookies.get('session')?.value;
  const ok = token ? await verifyToken(token).then(() => true, () => false) : false;
  if (!ok) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', request.url));
  }
  const res = NextResponse.next();
  // remember the last opened project so `/` can return to it
  const first = pathname.split('/')[1];
  if (first && first !== 'api' && !first.startsWith('_') && !first.includes('.') && request.method === 'GET')
    try {
      res.cookies.set('last_project', decodeURIComponent(first), { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
    } catch {
      // malformed percent-encoding: the page itself will 404
    }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
