'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getTranslations } from 'next-intl/server';
import { db, accounts, challenges } from '@/lib/db';
import { requireUser } from '@/lib/auth/user';

const schema = z
  .object({
    projectId: z.coerce.number().int(),
    title: z.string().trim().min(1).max(160),
    accountId: z.coerce.number().int().nullable(),
    postsPerDay: z.coerce.number().int().min(1).max(20),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((v) => v.endsOn >= v.startsOn, 'endBeforeStart');

export async function createChallenge(_prev: { error?: string } | undefined, form: FormData) {
  await requireUser();
  const raw = Object.fromEntries(form);
  const parsed = schema.safeParse({ ...raw, accountId: raw.accountId === 'all' ? null : raw.accountId });
  const t = await getTranslations('errors');
  if (!parsed.success) return { error: t(parsed.error.issues[0]?.message === 'endBeforeStart' ? 'endBeforeStart' : 'checkFields') };
  if (parsed.data.accountId) {
    const [acc] = await db.select({ projectId: accounts.projectId }).from(accounts).where(eq(accounts.id, parsed.data.accountId));
    if (acc?.projectId !== parsed.data.projectId) return { error: t('otherProjectAccount') };
  }
  await db.insert(challenges).values(parsed.data);
  revalidatePath('/', 'layout');
  return { error: undefined };
}

export async function deleteChallenge(id: number) {
  await requireUser();
  await db.delete(challenges).where(eq(challenges.id, id));
  revalidatePath('/', 'layout');
}
