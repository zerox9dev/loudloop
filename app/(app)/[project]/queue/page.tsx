import Link from 'next/link';
import { format, isToday, isTomorrow } from 'date-fns';
import { getTranslations } from 'next-intl/server';
import { getFormat } from '@/lib/i18n/server';
import type { Format } from '@/lib/i18n/format';
import { CalendarDays, PenLine } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { NewPostButton } from '@/components/new-post-button';
import { PostRowActions } from '@/components/post-row-actions';
import { PlatformIcon } from '@/components/platform-icon';
import { ProjectTile } from '@/components/project-switcher';
import { loadPage } from '@/lib/page';
import { listProjects } from '@/lib/projects';
import { listPosts, toComposerPost } from '@/lib/services/posts';

function dayLabel(d: Date, t: (k: 'today' | 'tomorrow') => string, f: Format) {
  if (isToday(d)) return t('today');
  if (isTomorrow(d)) return t('tomorrow');
  return f.date(d, 'EEEE, d MMMM');
}

export default async function QueuePage({ params }: PageProps<'/[project]/queue'>) {
  const { scope, accounts, projects, defaultProjectId } = await loadPage(params);
  const [t, f] = await Promise.all([getTranslations('queue'), getFormat()]);
  const [queued, list] = await Promise.all([listPosts(scope, { statuses: ['scheduled', 'publishing'], order: 'upcoming', limit: 500 }), listProjects()]);
  const groups = new Map<string, typeof queued>();
  for (const p of queued) {
    const key = p.scheduledAt ? format(p.scheduledAt, 'yyyy-MM-dd') : 'none';
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const project = (id: number) => list.find((p) => p.id === id);

  return (
    <>
      <PageHeader title={t('title')}>
        <Link href={`/${scope.slug}/drafts`} className="flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted">
          <PenLine className="size-4" /> {t('drafts')}
        </Link>
        <Link href={`/${scope.slug}/schedule`} className="flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted">
          <CalendarDays className="size-4" /> {t('calendar')}
        </Link>
        <NewPostButton accounts={accounts} projects={projects} defaultProjectId={defaultProjectId} />
      </PageHeader>
      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
        {queued.length === 0 && (
          <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
            {t('empty')}
          </p>
        )}
        {[...groups].map(([key, items]) => (
          <section key={key} className="space-y-2">
            <h2 className="text-sm font-medium capitalize text-muted-foreground">{items[0].scheduledAt ? dayLabel(items[0].scheduledAt, t, f) : t('noTime')}</h2>
            <ul className="divide-y rounded-lg border bg-card">
              {items.map((p) => {
                const pr = project(p.projectId);
                return (
                  <li key={p.id} className="flex items-start gap-3 p-3">
                    <span className="w-12 shrink-0 pt-0.5 text-sm font-medium tabular">{p.scheduledAt ? format(p.scheduledAt, 'HH:mm') : '—'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm">{p.text}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {pr && <ProjectTile name={pr.name} id={pr.id} className="size-4 text-[10px]" />}
                        <span>{pr?.name}</span>
                        <span className="flex gap-0.5">
                          {[...new Set(p.targets.map((t) => t.platform))].map((pl) => (
                            <PlatformIcon key={pl} platform={pl} size={12} />
                          ))}
                        </span>
                      </div>
                    </div>
                    <PostRowActions accounts={accounts} projects={projects} post={toComposerPost(p)} editable retryable={false} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
