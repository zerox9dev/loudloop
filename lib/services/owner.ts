import { asc } from 'drizzle-orm';
import { db, users } from '@/lib/db';

/** The owner's interface language — the default language for generated texts. */
export async function ownerLocale() {
  const [u] = await db.select({ locale: users.locale }).from(users).orderBy(asc(users.id)).limit(1);
  return u?.locale ?? 'en';
}
