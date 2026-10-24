'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getTranslations } from 'next-intl/server';
import { db, accounts, comments, postTargets } from '@/lib/db';
import { requireUser } from '@/lib/auth/user';
import { getAdapter, prepareContext } from '@/lib/providers';

export async function replyToComment(id: number, text: string) {
  await requireUser();
  const body = z.string().trim().min(1).max(2000).parse(text);
  const [row] = await db
    .select({ c: comments, a: accounts, postExternalId: postTargets.externalId })
    .from(comments)
    .innerJoin(accounts, eq(accounts.id, comments.accountId))
    .leftJoin(postTargets, eq(postTargets.id, comments.targetId))
    .where(eq(comments.id, id));
  if (!row) return { ok: false, error: (await getTranslations('errors'))('commentNotFound') };
  try {
    await getAdapter(row.a).reply(await prepareContext(row.a), { externalId: row.c.externalId, postExternalId: row.postExternalId ?? undefined }, body);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  await db.update(comments).set({ replyText: body, repliedAt: new Date(), isRead: true }).where(eq(comments.id, id));
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function markRead(ids: number[]) {
  await requireUser();
  if (ids.length) await db.update(comments).set({ isRead: true }).where(inArray(comments.id, ids));
  revalidatePath('/', 'layout');
}

/** projectId null = every project (the /all view). */
export async function markAllRead(projectId: number | null) {
  await requireUser();
  const scoped = projectId === null ? undefined : inArray(comments.accountId, db.select({ id: accounts.id }).from(accounts).where(eq(accounts.projectId, projectId)));
  await db.update(comments).set({ isRead: true }).where(and(eq(comments.isRead, false), scoped));
  revalidatePath('/', 'layout');
}
