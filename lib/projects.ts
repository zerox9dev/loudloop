import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { asc, eq, inArray, isNull, type SQL, type AnyColumn } from 'drizzle-orm';
import { db, accounts, projects, type Project } from '@/lib/db';

/** URL segment that means "every project". */
export const ALL = 'all';

/** Slugs that would collide with top-level routes. */
export const RESERVED_SLUGS = new Set([ALL, 'login', 'share', 'media', 'api', 'new', 'settings']);

/**
 * The project a request is scoped to. `project === null` means the cross-project view (/all):
 * reads aggregate everything, writes must name a concrete project.
 */
export type Scope = { slug: string; project: Project | null; projectIds: number[] };

export const listProjects = cache(async () =>
  db.select().from(projects).where(isNull(projects.archivedAt)).orderBy(asc(projects.position), asc(projects.id)),
);

export const resolveScope = cache(async (slug: string): Promise<Scope> => {
  const all = await listProjects();
  if (slug === ALL) return { slug, project: null, projectIds: all.map((p) => p.id) };
  const project = all.find((p) => p.slug === decodeURIComponent(slug));
  if (!project) notFound();
  return { slug: project.slug, project, projectIds: [project.id] };
});

/** `where` fragment restricting a table's project_id column to the scope. */
export function inScope(column: AnyColumn, scope: Scope): SQL {
  return scope.project ? eq(column, scope.project.id) : inArray(column, scope.projectIds.length ? scope.projectIds : [-1]);
}

/** Cached per request: layout and page both read the scope's accounts. */
export const scopeAccounts = cache(async (scope: Scope) =>
  db.select().from(accounts).where(inScope(accounts.projectId, scope)).orderBy(asc(accounts.id)),
);

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
};

export function slugify(name: string) {
  const base = name
    .toLowerCase()
    .split('')
    .map((c) => TRANSLIT[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'project';
}

/** A free slug derived from the name (adds -2, -3… on collision or reserved words). */
export async function uniqueSlug(name: string, exceptId?: number) {
  const base = slugify(name);
  const taken = new Set((await db.select({ slug: projects.slug, id: projects.id }).from(projects)).filter((p) => p.id !== exceptId).map((p) => p.slug));
  let slug = base;
  for (let i = 2; taken.has(slug) || RESERVED_SLUGS.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

export async function projectById(id: number) {
  const [p] = await db.select().from(projects).where(eq(projects.id, id));
  return p ?? null;
}

/** Scope for a share link: a single project, or every project when projectId is null. */
export async function scopeForProjectId(projectId: number | null): Promise<Scope | null> {
  const all = await listProjects();
  if (projectId === null) return { slug: ALL, project: null, projectIds: all.map((p) => p.id) };
  const project = all.find((p) => p.id === projectId);
  return project ? { slug: project.slug, project, projectIds: [project.id] } : null;
}
