import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { db, accounts, comments, postTargets, posts } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { CommentItem } from '@/components/comment-item';
import { MarkAllRead } from '@/components/mark-all-read';
import { PlatformIcon } from '@/components/platform-icon';
import { isPlatform, PLATFORMS, PLATFORM_META } from '@/lib/platforms';
import { cn } from '@/lib/utils';
import { inScope, resolveScope } from '@/lib/projects';

export default async function RepliesPage({ params, searchParams }: PageProps<'/[project]/replies'>) {
  const scope = await resolveScope((await params).project);
  const t = await getTranslations('replies');
  const sp = await searchParams;
  const filter = sp.filter === 'all' ? 'all' : 'unread';
  const platform = typeof sp.p === 'string' && isPlatform(sp.p) ? sp.p : null;
  const where: SQL[] = [inScope(accounts.projectId, scope)];
  if (filter === 'unread') where.push(eq(comments.isRead, false));
  if (platform) where.push(eq(accounts.platform, platform));

  const rows = await db
    .select({ c: comments, platform: accounts.platform, postText: posts.text, postUrl: postTargets.url })
    .from(comments)
    .innerJoin(accounts, eq(accounts.id, comments.accountId))
    .leftJoin(postTargets, eq(postTargets.id, comments.targetId))
    .leftJoin(posts, eq(posts.id, postTargets.postId))
    .where(and(...where))
    .orderBy(desc(comments.postedAt))
    .limit(200);

  const link = (next: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { filter, p: platform, ...next };
    if (merged.filter === 'all') q.set('filter', 'all');
    if (merged.p) q.set('p', merged.p);
    return `/${scope.slug}/replies${q.size ? `?${q}` : ''}`;
  };
  const tab = (active: boolean) => cn('rounded-lg px-3 py-1.5 text-sm', active ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground');

  return (
    <>
      <PageHeader title={t('title')}>
        <MarkAllRead projectId={scope.project?.id ?? null} />
      </PageHeader>
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex rounded-lg bg-muted p-1" aria-label={t('filter')}>
            <Link href={link({ filter: 'unread' })} className={tab(filter === 'unread')}>{t('unread')}</Link>
            <Link href={link({ filter: 'all' })} className={tab(filter === 'all')}>{t('all')}</Link>
          </nav>
          <nav className="flex flex-wrap gap-1" aria-label={t('platform')}>
            <Link href={link({ p: null })} className={cn('rounded-lg border px-3 py-1.5 text-sm', !platform && 'bg-muted')}>{t('allChannels')}</Link>
            {PLATFORMS.map((p) => (
              <Link key={p} href={link({ p })} className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm', platform === p && 'bg-muted')}>
                <PlatformIcon platform={p} size={14} />
                {PLATFORM_META[p].label}
              </Link>
            ))}
          </nav>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{filter === 'unread' ? t('allRead') : t('none')}</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {rows.map((r) => (
              <CommentItem
                key={r.c.id}
                c={{
                  id: r.c.id,
                  platform: r.platform,
                  authorName: r.c.authorName,
                  authorHandle: r.c.authorHandle,
                  text: r.c.text,
                  postedAt: r.c.postedAt.toISOString(),
                  isRead: r.c.isRead,
                  replyText: r.c.replyText,
                  postText: r.postText,
                  postUrl: r.postUrl,
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
