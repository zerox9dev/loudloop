import 'server-only';
import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, users } from '@/lib/db';
import { getSession } from './session';

export const currentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));
  return user ?? null;
});

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}
