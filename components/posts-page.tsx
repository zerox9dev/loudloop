import { PageHeader } from '@/components/page-header';
import { PostsTable } from '@/components/posts-table';
import { NewPostButton } from '@/components/new-post-button';
import { listPosts } from '@/lib/services/posts';
import { loadPage } from '@/lib/page';
import Link from 'next/link';
import type { PostKind } from '@/lib/db/schema';
import { KINDS } from '@/lib/platforms';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';

export async function PostsPage({ params, title, kind, empty }: { params: Promise<{ project: string }>; title: string; kind?: PostKind; empty: string }) {
  const { scope, accounts, projects, defaultProjectId } = await loadPage(params);
  const [t, tk] = await Promise.all([getTranslations('posts'), getTranslations('kinds')]);
  const rows = await listPosts(scope, { kind, statuses: ['published', 'partial', 'failed', 'publishing'] });
  return (
    <>
      <PageHeader title={title}>
        <NewPostButton accounts={accounts} projects={projects} defaultProjectId={defaultProjectId} initial={kind ? { kind } : undefined} />
      </PageHeader>
      <div className="mx-auto w-full max-w-[1600px] p-4 md:p-8">
        <nav className="mb-4 flex w-fit rounded-lg bg-muted p-1" aria-label={t('format')}>
          {([undefined, ...KINDS] as const).map((k) => (
            <Link
              key={k ?? 'all'}
              href={`/${scope.slug}/posts${k ? `?kind=${k}` : ''}`}
              className={cn('rounded-md px-3 py-1.5 text-sm', kind === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {k ? tk(k) : t('all')}
            </Link>
          ))}
        </nav>
        <PostsTable rows={rows} accounts={accounts} projects={projects} empty={empty} />
      </div>
    </>
  );
}
