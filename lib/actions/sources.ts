'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getTranslations } from 'next-intl/server';
import { db, sources } from '@/lib/db';
import { requireUser } from '@/lib/auth/user';
import { fetchSource } from '@/lib/services/sources';

const schema = z.object({ projectId: z.coerce.number().int(), name: z.string().trim().min(1).max(160), url: z.string().url() });

export async function addSource(_prev: { error?: string } | undefined, form: FormData) {
  await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(form));
  const t = await getTranslations('errors');
  if (!parsed.success) return { error: t('sourceInvalid') };
  const [row] = await db.insert(sources).values(parsed.data).onConflictDoNothing().returning();
  if (!row) return { error: t('sourceExists') };
  await fetchSource(row);
  revalidatePath('/', 'layout');
  return { error: undefined };
}

export async function removeSource(id: number) {
  await requireUser();
  await db.delete(sources).where(eq(sources.id, id));
  revalidatePath('/', 'layout');
}

export async function refreshSource(id: number) {
  await requireUser();
  const [row] = await db.select().from(sources).where(eq(sources.id, id));
  if (row) await fetchSource(row);
  revalidatePath('/', 'layout');
}
