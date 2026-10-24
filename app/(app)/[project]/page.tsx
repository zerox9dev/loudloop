import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/page-header';
import { OverviewFilters } from '@/components/overview/filters';
import { OverviewBody, parseOverviewParams } from '@/components/overview/overview';
import { resolveScope, scopeAccounts } from '@/lib/projects';
import { isActive } from '@/lib/providers';

export default async function OverviewPage({ params, searchParams }: PageProps<'/[project]'>) {
  const scope = await resolveScope((await params).project);
  const t = await getTranslations('overview');
  const { selected, range } = parseOverviewParams(await searchParams);
  const platforms = (await scopeAccounts(scope)).filter(isActive).map((a) => a.platform);
  return (
    <>
      <PageHeader title={scope.project ? t('title') : t('titleAll')}>
        <OverviewFilters platforms={[...new Set(platforms)]} selected={selected} range={range} projectId={scope.project?.id ?? null} />
      </PageHeader>
      <OverviewBody scope={scope} selected={selected} range={range} />
    </>
  );
}
