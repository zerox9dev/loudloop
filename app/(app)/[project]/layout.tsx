import { cookies } from 'next/headers';
import { and, count, eq, isNull } from 'drizzle-orm';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '@/components/app-sidebar';
import { requireUser } from '@/lib/auth/user';
import { db, accounts, comments, ideas, posts, signals } from '@/lib/db';
import { inScope, listProjects, resolveScope, scopeAccounts } from '@/lib/projects';

export default async function ProjectLayout({ children, params }: LayoutProps<'/[project]'>) {
  const user = await requireUser();
  const scope = await resolveScope((await params).project);
  const [accs, projectList, [{ unread }], [{ open }], cookieStore] = await Promise.all([
    scopeAccounts(scope),
    listProjects(),
    db
      .select({ unread: count() })
      .from(comments)
      .innerJoin(accounts, eq(accounts.id, comments.accountId))
      .where(and(eq(comments.isRead, false), inScope(accounts.projectId, scope))),
    db.select({ open: count() }).from(signals).where(and(isNull(signals.dismissedAt), inScope(signals.projectId, scope))),
    cookies(),
  ]);
  const [[{ review }], [{ fresh }]] = await Promise.all([
    db.select({ review: count() }).from(posts).where(and(eq(posts.status, 'review'), inScope(posts.projectId, scope))),
    db.select({ fresh: count() }).from(ideas).where(and(eq(ideas.status, 'new'), inScope(ideas.projectId, scope))),
  ]);
  const lastSync = accs.reduce<Date | null>((m, a) => (a.lastSyncedAt && (!m || a.lastSyncedAt > m) ? a.lastSyncedAt : m), null);
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultOpen} style={{ '--sidebar-width': '17rem' } as React.CSSProperties}>
        <AppSidebar
          userName={user.name}
          slug={scope.slug}
          projects={projectList.map((p) => ({ id: p.id, slug: p.slug, name: p.name }))}
          accounts={accs.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, status: a.status, projectId: a.projectId }))}
          review={review}
          ideas={fresh}
          unread={unread}
          signals={open}
          lastSyncedAt={lastSync?.toISOString() ?? null}
          hasErrors={accs.some((a) => a.lastError)}
        />
        <SidebarInset className="min-w-0">{children}</SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
