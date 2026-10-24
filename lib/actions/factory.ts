'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getLocale, getTranslations } from 'next-intl/server';
import { isLocale } from '@/i18n/config';
import { db, accounts, ideas, posts, projects, slots, type Platform, type ProjectBrief } from '@/lib/db';
import { requireUser } from '@/lib/auth/user';
import { approvePosts, autoFill, draftsFromIdea, type Angle } from '@/lib/services/factory';
import { generateVariants } from '@/lib/services/generate';
import { unschedulePost } from '@/lib/queue';

type State = { error?: string; ok?: string } | undefined;
const refresh = () => revalidatePath('/', 'layout');

// ---------- ideas ----------

const ideaSchema = z.object({
  projectId: z.coerce.number().int(),
  title: z.string().trim().min(3, 'ideaTooShort').max(500, 'ideaTooLong'),
  body: z.string().trim().max(5000, 'ideaTooLong').optional(),
  url: z.union([z.literal(''), z.string().url('badLink')]).optional(),
});

export async function addIdea(_prev: State, form: FormData): Promise<State> {
  await requireUser();
  const parsed = ideaSchema.safeParse(Object.fromEntries(form));
  const t = await getTranslations();
  const code = parsed.success ? null : parsed.error.issues[0].message;
  if (!parsed.success) return { error: t(`errors.${['ideaTooShort', 'ideaTooLong', 'badLink'].includes(code!) ? code : 'checkFields'}` as 'errors.checkFields') };
  const { projectId, title, body, url } = parsed.data;
  await db.insert(ideas).values({ projectId, title, body: body || null, url: url || null, kind: 'note' });
  refresh();
  return { ok: t('ok.ideaAdded') };
}

export async function dismissIdea(id: number) {
  await requireUser();
  await db.update(ideas).set({ status: 'dismissed' }).where(eq(ideas.id, id));
  refresh();
}

export async function makeDrafts(ideaId: number, angles: Angle[]) {
  await requireUser();
  const res = await draftsFromIdea(ideaId, angles);
  refresh();
  return { created: res.created.length, skipped: res.skipped, ai: res.created.some((c) => c.source === 'ai') };
}

export async function fillPipeline() {
  await requireUser();
  const made = await autoFill(3);
  refresh();
  return made.length;
}

// ---------- review ----------

export async function approve(postIds: number[], mode: 'queue' | 'now') {
  await requireUser();
  const res = await approvePosts(z.array(z.number().int()).parse(postIds), mode);
  refresh();
  return res.map((r) => ({ id: r.id, at: r.at.toISOString() }));
}

export async function reject(postIds: number[]) {
  await requireUser();
  const ids = z.array(z.number().int()).parse(postIds);
  const rows = await db
    .delete(posts)
    .where(and(inArray(posts.id, ids), inArray(posts.status, ['review', 'draft'])))
    .returning({ id: posts.id, ideaId: posts.ideaId });
  for (const r of rows) await unschedulePost(r.id);
  // an idea whose drafts were all rejected returns to the list (not to autoFill) for another try
  const ideaIds = [...new Set(rows.map((r) => r.ideaId).filter((x): x is number => x !== null))];
  for (const ideaId of ideaIds) {
    const [left] = await db.select({ id: posts.id }).from(posts).where(eq(posts.ideaId, ideaId)).limit(1);
    if (!left) await db.update(ideas).set({ status: 'rejected' }).where(eq(ideas.id, ideaId));
  }
  refresh();
}

// ---------- composer helper ----------

export async function suggestVariants(input: { projectId: number; text: string; platforms: Platform[] }) {
  await requireUser();
  const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId));
  if (!project) throw new Error('Project not found');
  const res = await generateVariants({
    angle: project.kind === 'founder' ? 'founder' : 'product',
    project: { name: project.name, brief: project.brief },
    idea: { title: input.text },
    language: await getLocale(),
    platforms: input.platforms,
  });
  return res;
}

// ---------- brief & rhythm ----------

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

export async function saveBrief(_prev: State, form: FormData): Promise<State> {
  await requireUser();
  const id = Number(form.get('projectId'));
  const links: ProjectBrief['links'] = [];
  for (const l of lines(form.get('links'))) {
    // "Лендинг | https://…" or a bare URL
    const [a, b] = l.includes('|') ? l.split('|').map((s) => s.trim()) : ['', l];
    const url = b || a;
    if (!/^https?:\/\//.test(url)) return { error: (await getTranslations('errors'))('linkNoHttp', { url }) };
    links.push({ label: b ? a : new URL(url).hostname, url });
  }
  const promo = form.get('promoShare');
  const brief: ProjectBrief = {
    about: String(form.get('about') ?? '').trim() || undefined,
    audience: String(form.get('audience') ?? '').trim() || undefined,
    voice: String(form.get('voice') ?? '').trim() || undefined,
    avoid: String(form.get('avoid') ?? '').trim() || undefined,
    // 'auto' (or anything unknown) = follow the owner's interface language
    language: isLocale(form.get('language')) ? String(form.get('language')) : undefined,
    pillars: lines(form.get('pillars')),
    links,
    ...(promo !== null && promo !== '' ? { promoShare: Math.min(100, Math.max(0, Number(promo))) } : {}),
  };
  await db.update(projects).set({ brief }).where(eq(projects.id, id));
  refresh();
  return { ok: (await getTranslations('ok'))('briefSaved') };
}

const slotSchema = z.array(z.object({ weekday: z.number().int().min(1).max(7), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }));

export async function saveSlots(accountId: number, defs: { weekday: number; time: string }[]) {
  await requireUser();
  const parsed = slotSchema.parse(defs);
  const [acc] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId));
  if (!acc) throw new Error('Account not found');
  await db.transaction(async (tx) => {
    await tx.delete(slots).where(eq(slots.accountId, accountId));
    if (parsed.length) await tx.insert(slots).values(parsed.map((d) => ({ accountId, ...d }))).onConflictDoNothing();
  });
  refresh();
}
