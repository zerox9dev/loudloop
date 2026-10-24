import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db, shareLinks } from '@/lib/db';
import { Logo } from '@/components/logo';
import { OverviewFilters } from '@/components/overview/filters';
import { OverviewBody, parseOverviewParams } from '@/components/overview/overview';
import { scopeAccounts, scopeForProjectId } from '@/lib/projects';
import { isActive } from '@/lib/providers';

export async function generateMetadata() {
  return { title: (await getTranslations('share'))('title'), robots: { index: false } };
}

export default async function SharePage({ params, searchParams }: PageProps<'/share/[token]'>) {
  const { token } = await params;
  const [link] = await db.select().from(shareLinks).where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)));
  if (!link) notFound();
  const scope = await scopeForProjectId(link.projectId);
  if (!scope) notFound();
  const { selected, range } = parseOverviewParams(await searchParams);
  const t = await getTranslations('share');
  const platforms = (await scopeAccounts(scope)).filter(isActive).map((a) => a.platform);
  return (
    <main className="min-h-svh bg-background">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3 md:px-8">
        <Logo className="size-8" />
        <span className="font-semibold">Loudloop</span>
        <span className="text-muted-foreground">· {scope.project?.name ?? t('allProjects')} · {t('readOnly')}</span>
        <div className="ml-auto">
          <OverviewFilters platforms={[...new Set(platforms)]} selected={selected} range={range} readOnly />
        </div>
      </header>
      <OverviewBody scope={scope} selected={selected} range={range} readOnly />
    </main>
  );
}
