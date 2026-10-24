import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/page-header';
import { NewPostButton } from '@/components/new-post-button';
import { ScheduleCalendar } from '@/components/schedule-calendar';
import { listPosts } from '@/lib/services/posts';
import { loadPage } from '@/lib/page';

export default async function SchedulePage({ params }: PageProps<'/[project]/schedule'>) {
  const { scope, accounts, projects, defaultProjectId } = await loadPage(params);
  const t = await getTranslations('posts');
  const [upcoming, history] = await Promise.all([
    listPosts(scope, { statuses: ['scheduled', 'publishing'], order: 'upcoming', limit: 1000 }),
    listPosts(scope, { statuses: ['published', 'partial', 'failed'], limit: 500 }),
  ]);
  const rows = [...upcoming, ...history];
  const posts = rows
    .map((p) => ({
      id: p.id,
      projectId: p.projectId,
      kind: p.kind,
      text: p.text,
      media: p.media,
      accountIds: p.targets.map((t) => t.accountId),
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      status: p.status,
      at: (p.publishedAt ?? p.scheduledAt)?.toISOString() ?? '',
      platforms: [...new Set(p.targets.map((t) => t.platform))],
    }))
    .filter((p) => p.at);
  return (
    <>
      <PageHeader title={t('schedule')}>
        <NewPostButton accounts={accounts} projects={projects} defaultProjectId={defaultProjectId} />
      </PageHeader>
      <div className="mx-auto w-full max-w-[1600px] p-4 md:p-8">
        <ScheduleCalendar posts={posts} accounts={accounts} projects={projects} defaultProjectId={defaultProjectId} />
      </div>
    </>
  );
}
