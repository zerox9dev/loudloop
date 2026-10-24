import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/page-header';
import { PostsTable } from '@/components/posts-table';
import { NewPostButton } from '@/components/new-post-button';
import { listPosts } from '@/lib/services/posts';
import { loadPage } from '@/lib/page';

export default async function DraftsPage({ params }: PageProps<'/[project]/drafts'>) {
  const { scope, accounts, projects, defaultProjectId } = await loadPage(params);
  const rows = await listPosts(scope, { statuses: ['draft'] });
  const t = await getTranslations('posts');
  return (
    <>
      <PageHeader title={t('drafts')}>
        <NewPostButton accounts={accounts} projects={projects} defaultProjectId={defaultProjectId} />
      </PageHeader>
      <div className="mx-auto w-full max-w-[1600px] p-4 md:p-8">
        <PostsTable rows={rows} accounts={accounts} projects={projects} empty={t('draftsEmpty')} dateField="scheduledAt" />
      </div>
    </>
  );
}
