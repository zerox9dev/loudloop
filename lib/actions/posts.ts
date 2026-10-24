'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, lt, ne, notInArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, accounts, posts, postTargets, sourceItems } from '@/lib/db';
import { requireUser } from '@/lib/auth/user';
import { saveUpload } from '@/lib/media';
import { schedulePost, unschedulePost } from '@/lib/queue';
import { issueTexts, validateCompose, type Issue } from '@/lib/services/validate';
import { getTranslations } from 'next-intl/server';
import { nextFreeSlot } from '@/lib/services/slots';

const mediaSchema = z.object({ path: z.string(), mime: z.string(), width: z.number().optional(), height: z.number().optional(), s3: z.boolean().optional() });

const saveSchema = z.object({
  id: z.number().int().optional(),
  projectId: z.number().int(),
  kind: z.enum(['post', 'photo', 'story', 'reel']),
  text: z.string().max(10_000),
  media: z.array(mediaSchema).max(20),
  accountIds: z.array(z.number().int()),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  mode: z.enum(['draft', 'schedule', 'now', 'queue']),
  sourceItemId: z.number().int().nullable().optional(),
  variants: z.partialRecord(z.enum(['telegram', 'instagram', 'threads', 'x', 'linkedin']), z.string().nullable()).optional(),
});

export type SaveInput = z.infer<typeof saveSchema>;

function revalidateAll() {
  revalidatePath('/', 'layout');
}

export async function savePost(raw: SaveInput): Promise<{ ok: true; id: number } | { ok: false; errors: string[] }> {
  await requireUser();
  const input = saveSchema.parse(raw);
  const t = await getTranslations();
  const fail = (...issues: Issue[]) => ({ ok: false as const, errors: issueTexts(issues, t as never) });
  const accs = input.accountIds.length ? await db.select().from(accounts).where(inArray(accounts.id, input.accountIds)) : [];
  // a post belongs to exactly one project, and so must every account it targets
  if (accs.length !== input.accountIds.length || accs.some((a) => a.projectId !== input.projectId))
    return fail({ code: 'mixedProjects' });

  if (input.mode !== 'draft') {
    const errors = validateCompose({ kind: input.kind, text: input.text, media: input.media, platforms: accs.map((a) => a.platform), variants: input.variants });
    const at = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (input.mode === 'schedule' && !at) errors.push({ code: 'needTime' });
    if (input.mode === 'schedule' && at && at.getTime() < Date.now() - 60_000) errors.push({ code: 'timePassed' });
    if (errors.length) return fail(...errors);
  }

  let wasReview = false;
  if (input.id) {
    const [existing] = await db.select().from(posts).where(eq(posts.id, input.id));
    wasReview = existing?.status === 'review';
    if (!existing || existing.projectId !== input.projectId) return fail({ code: 'notFound' });
    if (['publishing', 'published', 'partial'].includes(existing.status)) return fail({ code: 'publishedLocked' });
  }

  // saving a generated draft keeps it in the review queue
  const status = input.mode === 'draft' ? (wasReview ? 'review' : 'draft') : 'scheduled';
  const scheduledAt =
    input.mode === 'now'
      ? new Date()
      : input.mode === 'queue'
        ? await nextFreeSlot(accs.map((a) => a.id))
        : input.scheduledAt
          ? new Date(input.scheduledAt)
          : null;
  const values = { kind: input.kind, text: input.text, media: input.media, status, scheduledAt, updatedAt: new Date() } as const;

  const id = await db.transaction(async (tx) => {
    let postId = input.id;
    if (postId) {
      // conditional update: the worker may have claimed the post since we checked
      const updated = await tx
        .update(posts)
        .set(values)
        .where(and(eq(posts.id, postId), inArray(posts.status, ['draft', 'review', 'scheduled', 'failed'])))
        .returning({ id: posts.id });
      if (updated.length === 0) return null;
    } else postId = (await tx.insert(posts).values({ ...values, projectId: input.projectId, sourceItemId: input.sourceItemId ?? null }).returning({ id: posts.id }))[0].id;

    const ids = accs.map((a) => a.id);
    await tx.delete(postTargets).where(and(eq(postTargets.postId, postId), ids.length ? notInArray(postTargets.accountId, ids) : undefined));
    if (ids.length)
      await tx
        .insert(postTargets)
        .values(ids.map((accountId) => ({ postId: postId!, accountId })))
        .onConflictDoUpdate({
          target: [postTargets.postId, postTargets.accountId],
          set: { status: 'pending', error: null },
          // never reset a target that already went out
          setWhere: ne(postTargets.status, 'published'),
        });
    // platform-native variants live on the targets
    for (const a of accs) {
      const v = input.variants?.[a.platform];
      await tx
        .update(postTargets)
        .set({ text: v && v.trim() ? v : null })
        .where(and(eq(postTargets.postId, postId), eq(postTargets.accountId, a.id), ne(postTargets.status, 'published')));
    }
    if (input.sourceItemId) await tx.update(sourceItems).set({ usedAt: new Date() }).where(eq(sourceItems.id, input.sourceItemId));
    return postId;
  });
  if (id === null) return fail({ code: 'inProgress' });

  if (status === 'scheduled') await schedulePost(id, scheduledAt);
  else await unschedulePost(id);
  revalidateAll();
  return { ok: true, id };
}

export async function uploadMedia(form: FormData) {
  await requireUser();
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  const out = [];
  for (const f of files) {
    if (f.size > 200 * 1024 * 1024) throw new Error((await getTranslations('composer'))('fileTooBig', { name: f.name }));
    out.push(await saveUpload(f));
  }
  return out;
}

export async function deletePost(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const [p] = await db.select({ imported: posts.imported }).from(posts).where(eq(posts.id, id));
  // the next sync would bring it back anyway: it lives on the platform
  if (p?.imported) return { ok: false, error: (await getTranslations('posts'))('importedReadonly') };
  await unschedulePost(id);
  await db.delete(posts).where(eq(posts.id, id));
  revalidateAll();
  return { ok: true };
}

export async function reschedulePost(id: number, iso: string) {
  await requireUser();
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) throw new Error('bad date');
  const [p] = await db.select().from(posts).where(eq(posts.id, id));
  if (!p || !['scheduled', 'draft', 'failed'].includes(p.status)) return { ok: false as const };
  await db.update(posts).set({ scheduledAt: at, status: p.status === 'draft' ? 'draft' : 'scheduled', updatedAt: new Date() }).where(eq(posts.id, id));
  if (p.status !== 'draft') await schedulePost(id, at);
  revalidateAll();
  return { ok: true as const };
}

export async function retryPost(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  // a post stuck in 'publishing' for 10+ minutes (worker crash) can be retried too;
  // already-sent targets are protected by the Redis sent-marker in publishPost
  const [claimed] = await db
    .update(posts)
    .set({ status: 'scheduled', updatedAt: new Date() })
    .where(
      and(
        eq(posts.id, id),
        or(inArray(posts.status, ['failed', 'partial']), and(eq(posts.status, 'publishing'), lt(posts.updatedAt, new Date(Date.now() - 10 * 60_000)))),
      ),
    )
    .returning({ id: posts.id });
  if (!claimed) return { ok: false, error: (await getTranslations('posts'))('busy') };
  await db.update(postTargets).set({ error: null }).where(and(eq(postTargets.postId, id), eq(postTargets.status, 'failed')));
  await schedulePost(id, null);
  revalidateAll();
  return { ok: true };
}
