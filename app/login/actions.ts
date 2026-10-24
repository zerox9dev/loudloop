'use server';

import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { loginDelayMs, recordFailure, resetFailures } from '@/lib/auth/rate-limit';
import { z } from 'zod';
import { db, users } from '@/lib/db';
import { clearSession, setSession } from '@/lib/auth/session';
import { setLocaleCookie } from '@/lib/i18n/locale';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'empty' as const };
  const key = parsed.data.email.toLowerCase();
  const delay = loginDelayMs(key);
  if (delay) await new Promise((r) => setTimeout(r, delay));
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase()));
  if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
    recordFailure(key);
    return { error: 'invalid' as const };
  }
  resetFailures(key);
  await setSession(user.id);
  await setLocaleCookie(user.locale);
  redirect('/');
}

export async function logout() {
  await clearSession();
  redirect('/login');
}
