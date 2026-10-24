import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { fromAcceptLanguage, isLocale, LOCALE_COOKIE, type Locale } from './config';

/**
 * No locale in URLs. Order: the cookie (set on login and on profile save) → the signed-in owner's
 * saved language (sessions that predate the cookie) → the browser's language (public pages).
 */
async function ownerLocale(): Promise<Locale | null> {
  try {
    const { getSession } = await import('@/lib/auth/session');
    const session = await getSession();
    if (!session) return null;
    const { db, users } = await import('@/lib/db');
    const [u] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, session.user.id));
    return isLocale(u?.locale) ? u.locale : null;
  } catch {
    return null;
  }
}

export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie) ? fromCookie : ((await ownerLocale()) ?? fromAcceptLanguage((await headers()).get('accept-language')));
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: process.env.TZ || 'Europe/Warsaw',
  };
});
