import Link from 'next/link';
import { and, desc, inArray } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { getFormat } from '@/lib/i18n/server';
import { ExternalLink, Rss } from 'lucide-react';
import { db, ideas } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { AddIdeaForm, IdeaActions } from '@/components/ideas-ui';
import { ProjectTile } from '@/components/project-switcher';
import { inScope, listProjects, resolveScope } from '@/lib/projects';
import { cn } from '@/lib/utils';


export default async function IdeasPage({ params, searchParams }: PageProps<'/[project]/ideas'>) {
  const scope = await resolveScope((await params).project);
  const [t, f] = await Promise.all([getTranslations('ideasPage'), getFormat()]);
  const sp = await searchParams;
  const show = sp.show === 'drafted' ? 'drafted' : 'new';
  const every = await listProjects();
  const all = every.filter((p) => scope.projectIds.includes(p.id));
  const hasFounder = every.some((p) => p.kind === 'founder');
  const rows = await db
    .select()
    .from(ideas)
    .where(and(inScope(ideas.projectId, scope), inArray(ideas.status, show === 'new' ? ['new', 'rejected'] : ['drafted'])))
    .orderBy(desc(ideas.createdAt))
    .limit(100);
  const project = (id: number) => all.find((p) => p.id === id);
  const tab = (active: boolean) => cn('rounded-md px-3 py-1.5 text-sm', active ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground');

  return (
    <>
      <PageHeader title={t('title')}>
        <Link href={`/${scope.slug}/sources`} className="flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted">
          <Rss className="size-4" /> {t('sources')}
        </Link>
      </PageHeader>
      <div className="mx-auto grid w-full max-w-[1400px] gap-6 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 space-y-3">
          <nav className="flex w-fit rounded-lg bg-muted p-1" aria-label={t('filter')}>
            <Link href={`/${scope.slug}/ideas`} className={tab(show === 'new')}>{t('new')}</Link>
            <Link href={`/${scope.slug}/ideas?show=drafted`} className={tab(show === 'drafted')}>{t('inWork')}</Link>
          </nav>
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
              {show === 'new' ? t('emptyNew') : t('emptyDrafted')}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {rows.map((i) => {
                const p = project(i.projectId);
                return (
                  <li key={i.id} className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {p && <ProjectTile name={p.name} id={p.id} className="size-4 text-[10px]" />}
                      <span>{p?.name}</span>·<span>{t(`kinds.${i.kind}` as 'kinds.note')}</span>·
                      <span>{f.ago(i.createdAt)}</span>
                      {i.status === 'rejected' && <span className="text-amber-700 dark:text-amber-400">· {t('rejected')}</span>}
                    </div>
                    <p className="font-medium">
                      {i.title}
                      {i.url && (
                        <a href={i.url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-foreground" aria-label={t('openSource')}>
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </p>
                    {i.body && <p className="line-clamp-3 text-sm text-muted-foreground">{i.body}</p>}
                    {show === 'new' && <IdeaActions id={i.id} isProduct={p?.kind === 'product'} hasFounder={hasFounder} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <aside className="space-y-3">
          <h2 className="text-[17px] font-semibold">{t('newIdea')}</h2>
          <AddIdeaForm projects={all.map((p) => ({ id: p.id, name: p.name }))} defaultProjectId={scope.project?.id ?? all[0]?.id} />
          <p className="text-xs text-muted-foreground">
            {t('hint')}
          </p>
        </aside>
      </div>
    </>
  );
}

