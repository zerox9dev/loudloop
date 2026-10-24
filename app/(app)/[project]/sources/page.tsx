import { asc, desc, eq, sql } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { getFormat } from '@/lib/i18n/server';
import { db, sourceItems, sources } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { AddSourceForm, SourceActions, ToDraftButton } from '@/components/sources-ui';
import { loadPage } from '@/lib/page';
import { inScope } from '@/lib/projects';

export default async function SourcesPage({ params }: PageProps<'/[project]/sources'>) {
  const { scope, accounts, projects } = await loadPage(params);
  const [list, items] = await Promise.all([
    db.select().from(sources).where(inScope(sources.projectId, scope)).orderBy(asc(sources.id)),
    db
      .select({ i: sourceItems, sourceName: sources.name, projectId: sources.projectId })
      .from(sourceItems)
      .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
      .where(inScope(sources.projectId, scope))
      .orderBy(sql`${sourceItems.usedAt} is not null`, desc(sourceItems.publishedAt))
      .limit(60),
  ]);
  const [t, f] = await Promise.all([getTranslations('sources'), getFormat()]);
  const ago = (d: Date | null) => (d ? f.ago(d) : t('neverFetched'));

  return (
    <>
      <PageHeader title={t('title')} />
      <div className="mx-auto grid w-full max-w-[1400px] gap-6 p-4 md:p-8 lg:grid-cols-[minmax(0,360px)_1fr]">
        <section className="min-w-0 space-y-4">
          <h2 className="text-[17px] font-semibold">{t('feeds')}</h2>
          {scope.project ? (
            <AddSourceForm projectId={scope.project.id} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('openProject')}</p>
          )}
          <ul className="divide-y rounded-lg border">
            {list.map((s) => (
              <li key={s.id} className="flex items-start gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.url}</p>
                  <p className={`mt-0.5 text-xs ${s.lastError ? 'text-destructive' : 'text-muted-foreground'}`}>{s.lastError ?? (s.lastFetchedAt ? t('updated', { ago: ago(s.lastFetchedAt) }) : t('neverFetched'))}</p>
                </div>
                <SourceActions id={s.id} />
              </li>
            ))}
            {list.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">{t('emptyFeeds')}</li>}
          </ul>
        </section>
        <section className="min-w-0 space-y-4">
          <h2 className="text-[17px] font-semibold">{t('items')}</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {items.map(({ i, sourceName, projectId }) => (
              <li key={i.id} className={`flex items-start gap-3 px-5 py-4 ${i.usedAt ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <a href={i.link ?? '#'} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {i.title}
                  </a>
                  {i.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{i.summary}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {projects && `${projects.find((p) => p.id === projectId)?.name} · `}
                    {sourceName} · {ago(i.publishedAt)}
                    {i.usedAt && ` · ${t('used')}`}
                  </p>
                </div>
                <ToDraftButton accounts={accounts.filter((a) => a.projectId === projectId)} projectId={projectId} itemId={i.id} text={`${i.title}\n\n${i.link ?? ''}`.trim()} />
              </li>
            ))}
            {items.length === 0 && <li className="p-10 text-center text-muted-foreground">{t('emptyItems')}</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
