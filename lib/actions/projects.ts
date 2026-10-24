'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, count, eq, inArray, isNull, max } from 'drizzle-orm';
import { z } from 'zod';
import { getTranslations } from 'next-intl/server';
import { db, accounts, challenges, posts, projects, signals } from '@/lib/db';
import { unschedulePost } from '@/lib/queue';
import { requireUser } from '@/lib/auth/user';
import { uniqueSlug } from '@/lib/projects';

type State = { error?: string } | undefined;
const nameSchema = z.string().trim().min(1).max(120);

export async function createProject(_prev: State, form: FormData): Promise<State> {
  await requireUser();
  const name = nameSchema.safeParse(form.get('name'));
  if (!name.success) return { error: (await getTranslations('errors'))('nameRequired') };
  const slug = await uniqueSlug(name.data);
  const [{ last }] = await db.select({ last: max(projects.position) }).from(projects);
  await db.insert(projects).values({ name: name.data, slug, position: (last ?? 0) + 1 });
  revalidatePath('/', 'layout');
  redirect(`/${slug}/account`);
}

export async function renameProject(_prev: State, form: FormData): Promise<State> {
  await requireUser();
  const id = Number(form.get('id'));
  const name = nameSchema.safeParse(form.get('name'));
  if (!name.success) return { error: (await getTranslations('errors'))('nameRequired') };
  const slug = await uniqueSlug(name.data, id);
  await db.update(projects).set({ name: name.data, slug }).where(eq(projects.id, id));
  revalidatePath('/', 'layout');
  redirect(`/${slug}/account`);
}

/**
 * "Delete" archives: posts, drafts, sources and history stay in the database (the project just
 * disappears from the switcher). Only projects without accounts can be archived.
 */
export async function deleteProject(id: number): Promise<State> {
  await requireUser();
  const [{ n }] = await db.select({ n: count() }).from(accounts).where(eq(accounts.projectId, id));
  const t = await getTranslations('errors');
  if (n > 0) return { error: t('projectHasChannels') };
  const [{ total }] = await db.select({ total: count() }).from(projects).where(isNull(projects.archivedAt));
  if (total <= 1) return { error: t('lastProject') };
  // nothing of an archived project may publish later: scheduled posts go back to drafts
  const scheduled = await db
    .update(posts)
    .set({ status: 'draft', updatedAt: new Date() })
    .where(and(eq(posts.projectId, id), inArray(posts.status, ['scheduled', 'failed', 'partial'])))
    .returning({ id: posts.id });
  for (const p of scheduled) await unschedulePost(p.id);
  await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, id));
  revalidatePath('/', 'layout');
  redirect('/');
}

/** Move a platform account (with its history, posts stay where they were) to another project. */
export async function moveAccount(accountId: number, projectId: number) {
  await requireUser();
  await db.transaction(async (tx) => {
    await tx.update(accounts).set({ projectId }).where(eq(accounts.id, accountId));
    // challenges and signals carry project_id too; they follow their account
    await tx.update(challenges).set({ projectId }).where(eq(challenges.accountId, accountId));
    await tx.update(signals).set({ projectId }).where(eq(signals.accountId, accountId));
  });
  revalidatePath('/', 'layout');
}
