import { and, count, desc, eq, gte, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import { subDays } from 'date-fns';
import { db, accounts, ideas, posts, postTargets, projects, type Project } from '@/lib/db';
import { isActive } from '@/lib/providers';
import { schedulePost } from '@/lib/queue';
import { PLATFORM_META } from '@/lib/platforms';
import { generateVariants } from './generate';
import { ownerLocale } from './owner';
import { nextFreeSlot } from './slots';

export type Angle = 'product' | 'founder';

/** Drafts that are generated but not yet published keep the pipeline "full" at this depth. */
export const PIPELINE_TARGET = 3;

async function founderProject() {
  const [p] = await db.select().from(projects).where(and(eq(projects.kind, 'founder'), isNull(projects.archivedAt)));
  return p ?? null;
}

async function activeAccounts(projectId: number) {
  return (await db.select().from(accounts).where(eq(accounts.projectId, projectId))).filter(isActive);
}

/**
 * Founder posts that promote a product (drafts made from a product's idea) may not exceed the
 * founder's promoShare over the last 30 days, so the personal account stays personal.
 */
export async function founderPromoAllowed(founder: Project) {
  const share = founder.brief.promoShare ?? 25;
  const rows = await db
    .select({ ideaProject: ideas.projectId })
    .from(posts)
    .leftJoin(ideas, eq(ideas.id, posts.ideaId))
    .where(and(eq(posts.projectId, founder.id), gte(posts.createdAt, subDays(new Date(), 30)), ne(posts.status, 'failed')));
  const promo = rows.filter((r) => r.ideaProject !== null && r.ideaProject !== founder.id).length;
  return ((promo + 1) / (rows.length + 1)) * 100 <= share;
}

async function createReviewPost(project: Project, angle: Angle, idea: typeof ideas.$inferSelect, product?: Project) {
  const accs = await activeAccounts(project.id);
  const platforms = [...new Set(accs.map((a) => a.platform))].filter((p) => PLATFORM_META[p].kinds.includes('post'));
  if (platforms.length === 0) return null;
  const { variants, source } = await generateVariants({
    angle,
    project: { name: project.name, brief: project.brief },
    product: product ? { name: product.name, brief: product.brief } : undefined,
    language: await ownerLocale(),
    idea,
    platforms,
  });
  const base = variants[platforms[0]] ?? idea.title;
  return db.transaction(async (tx) => {
    const [post] = await tx
      .insert(posts)
      .values({ projectId: project.id, kind: 'post', text: base, status: 'review', ideaId: idea.id })
      .returning({ id: posts.id });
    const targets = accs.filter((a) => platforms.includes(a.platform));
    await tx.insert(postTargets).values(targets.map((a) => ({ postId: post.id, accountId: a.id, text: variants[a.platform] ?? null })));
    return { postId: post.id, projectId: project.id, angle, source };
  });
}

/**
 * One idea → review drafts. For a product idea: a post from the product and (if allowed)
 * one from the founder's first-person angle. For a founder idea: a founder post.
 */
export async function draftsFromIdea(ideaId: number, angles: Angle[] = ['product', 'founder']) {
  const [idea] = await db.select().from(ideas).where(eq(ideas.id, ideaId));
  if (!idea) throw new Error('Idea not found');
  const [origin] = await db.select().from(projects).where(eq(projects.id, idea.projectId));
  const founder = await founderProject();
  const created: NonNullable<Awaited<ReturnType<typeof createReviewPost>>>[] = [];
  /** reasons as message keys (namespace factory.skip) */
  const skipped: { code: string; values?: Record<string, string | number> }[] = [];

  if (origin.kind === 'founder') {
    const r = await createReviewPost(origin, 'founder', idea);
    if (r) created.push(r);
    else skipped.push({ code: 'founderNoChannels' });
  } else {
    if (angles.includes('product')) {
      const r = await createReviewPost(origin, 'product', idea);
      if (r) created.push(r);
      else skipped.push({ code: 'productNoChannels', values: { name: origin.name } });
    }
    if (angles.includes('founder') && founder) {
      if (!(await founderPromoAllowed(founder))) skipped.push({ code: 'promoCap', values: { share: founder.brief.promoShare ?? 25 } });
      else {
        const r = await createReviewPost(founder, 'founder', idea, origin);
        if (r) created.push(r);
        else skipped.push({ code: 'founderNoChannels' });
      }
    }
  }
  if (created.length) await db.update(ideas).set({ status: 'drafted' }).where(eq(ideas.id, idea.id));
  return { created, skipped };
}

/** Approve drafts: straight to the next free slot of their primary account, or publish now. */
export async function approvePosts(postIds: number[], mode: 'queue' | 'now') {
  const scheduled: { id: number; at: Date }[] = [];
  for (const id of postIds) {
    const accs = await db.select({ accountId: postTargets.accountId }).from(postTargets).where(eq(postTargets.postId, id)).orderBy(postTargets.id);
    if (accs.length === 0) continue;
    const at = mode === 'now' ? new Date() : await nextFreeSlot(accs.map((a) => a.accountId));
    const [ok] = await db
      .update(posts)
      .set({ status: 'scheduled', scheduledAt: at, updatedAt: new Date() })
      .where(and(eq(posts.id, id), inArray(posts.status, ['review', 'draft'])))
      .returning({ id: posts.id });
    if (!ok) continue;
    await schedulePost(id, at);
    scheduled.push({ id, at });
  }
  return scheduled;
}

/** How many posts are on the way (waiting for approval or queued) per project. */
export async function pipelineDepth(projectIds: number[]) {
  if (projectIds.length === 0) return new Map<number, number>();
  const rows = await db
    .select({ projectId: posts.projectId, n: count() })
    .from(posts)
    .where(and(inArray(posts.projectId, projectIds), inArray(posts.status, ['review', 'scheduled'])))
    .groupBy(posts.projectId);
  return new Map(rows.map((r) => [r.projectId, r.n]));
}

/**
 * Keeps every project's pipeline at PIPELINE_TARGET by drafting from its newest ideas.
 * Runs daily in the worker and after new ideas arrive. Drafts always wait for approval.
 */
export async function autoFill(maxPerProject = 2) {
  const list = (await db.select().from(projects).where(isNull(projects.archivedAt))).filter((p) => p.brief.about);
  const made: number[] = [];
  for (const p of list) {
    // a project without accounts can't take drafts: don't burn (or keep re-picking) its ideas
    if ((await activeAccounts(p.id)).length === 0) continue;
    // re-read per project: product ideas also add founder drafts while we loop
    const depth = (await pipelineDepth([p.id])).get(p.id) ?? 0;
    let need = Math.min(PIPELINE_TARGET - depth, maxPerProject);
    if (need <= 0) continue;
    const fresh = await db
      .select({ id: ideas.id })
      .from(ideas)
      .where(and(eq(ideas.projectId, p.id), eq(ideas.status, 'new'), isNotNull(ideas.title)))
      .orderBy(desc(ideas.createdAt))
      .limit(need);
    for (const idea of fresh) {
      const res = await draftsFromIdea(idea.id, p.kind === 'founder' ? ['founder'] : ['product', 'founder']);
      made.push(...res.created.map((c) => c.postId));
      if (--need <= 0) break;
    }
  }
  return made;
}
