import { and, asc, desc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { db, accounts, posts, postTargets, type PostKind } from '@/lib/db';
import { inScope, type Scope } from '@/lib/projects';

export type PostWithTargets = Awaited<ReturnType<typeof listPosts>>[number];

export async function listPosts(scope: Scope, opts: { statuses?: (typeof posts.$inferSelect)['status'][]; kind?: PostKind; excludeDrafts?: boolean; order?: 'recent' | 'upcoming'; limit?: number }) {
  const where: SQL[] = [inScope(posts.projectId, scope)];
  if (opts.statuses) where.push(inArray(posts.status, opts.statuses));
  if (opts.kind) where.push(eq(posts.kind, opts.kind));
  if (opts.excludeDrafts) where.push(ne(posts.status, 'draft'));
  const rows = await db
    .select()
    .from(posts)
    .where(and(...where))
    .orderBy(opts.order === 'upcoming' ? asc(posts.scheduledAt) : sql`${posts.publishedAt} desc nulls last`, desc(posts.updatedAt))
    .limit(opts.limit ?? 200);
  if (rows.length === 0) return [];
  const targets = await db
    .select({ t: postTargets, platform: accounts.platform, handle: accounts.handle })
    .from(postTargets)
    .innerJoin(accounts, eq(accounts.id, postTargets.accountId))
    .where(inArray(postTargets.postId, rows.map((r) => r.id)));
  return rows.map((p) => {
    const ts = targets.filter((x) => x.t.postId === p.id).map((x) => ({ ...x.t, platform: x.platform, handle: x.handle }));
    return {
      ...p,
      targets: ts,
      totals: ts.reduce((s, t) => ({ views: s.views + t.views, reactions: s.reactions + t.reactions, comments: s.comments + t.comments }), { views: 0, reactions: 0, comments: 0 }),
    };
  });
}

export async function composerAccounts(scope: Scope) {
  const rows = await db.select().from(accounts).where(inScope(accounts.projectId, scope)).orderBy(accounts.id);
  return rows.map((a) => ({ id: a.id, projectId: a.projectId, platform: a.platform, handle: a.handle, status: a.status }));
}

/** What the composer needs to edit an existing post, including per-platform variants. */
export function toComposerPost(p: PostWithTargets) {
  const variants: Partial<Record<(typeof p.targets)[number]['platform'], string>> = {};
  for (const t of p.targets) if (t.text) variants[t.platform] = t.text;
  return {
    id: p.id,
    projectId: p.projectId,
    kind: p.kind,
    text: p.text,
    media: p.media,
    accountIds: p.targets.map((t) => t.accountId),
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    status: p.status,
    variants,
  };
}

/** The text each platform will actually get (its variant, or the base text). */
export function platformTexts(p: PostWithTargets) {
  const seen = new Map<(typeof p.targets)[number]['platform'], string>();
  for (const t of p.targets) if (!seen.has(t.platform)) seen.set(t.platform, t.text ?? p.text);
  return [...seen].map(([platform, text]) => ({ platform, text }));
}
