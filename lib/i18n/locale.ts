import 'server-only';
import { cookies } from 'next/headers';
import { isLocale, LOCALE_COOKIE } from '@/i18n/config';

/** The interface language follows the owner's profile; the cookie lets next-intl read it per request. */
export async function setLocaleCookie(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
}
