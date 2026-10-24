import { PageHeader } from '@/components/page-header';
import { PlatformIcon } from '@/components/platform-icon';
import { FollowersChart } from '@/components/overview/followers-chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { followerSeries, seriesByPlatform } from '@/lib/services/analytics';
import { listProjects, resolveScope, scopeAccounts } from '@/lib/projects';
import { isActive } from '@/lib/providers';
import { PLATFORM_META } from '@/lib/platforms';
import { getTranslations } from 'next-intl/server';
import { getFormat } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';

const RANGE = 90;

export default async function AudiencePage({ params }: PageProps<'/[project]/audience'>) {
  const scope = await resolveScope((await params).project);
  const [t, f] = await Promise.all([getTranslations('audience'), getFormat()]);
  const [accs, projectList] = await Promise.all([scopeAccounts(scope).then((r) => r.filter(isActive)), listProjects()]);
  const series = await followerSeries(accs.map((a) => a.id), RANGE);
  const n = series.days.length;

  const rows = accs.map((a) => {
    const v = series.byAccount[a.id] ?? [];
    const now = v[n - 1] ?? null;
    const at = (daysBack: number) => v[n - 1 - daysBack] ?? v.find((x) => x !== null) ?? null;
    const diff = (d: number) => (now !== null && at(d) !== null ? now - at(d)! : null);
    const deltas = v.slice(1).map((x, i) => (x !== null && v[i] !== null ? x - v[i]! : null)).filter((x): x is number => x !== null);
    const best = deltas.length ? Math.max(...deltas) : null;
    const g30 = diff(30);
    return { a, now, d7: diff(7), d30: g30, d90: diff(RANGE), avg: g30 !== null ? g30 / 30 : null, best };
  });

  const cell = (x: number | null) => (
    <TableCell className={cn('text-right tabular', x === null ? 'text-muted-foreground' : x > 0 ? 'text-positive' : x < 0 ? 'text-destructive' : '')}>
      {x === null ? '—' : f.signed(x)}
    </TableCell>
  );

  return (
    <>
      <PageHeader title={t('title')} />
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-8">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>{t('platform')}</TableHead>
                <TableHead className="text-right">{t('followers')}</TableHead>
                <TableHead className="text-right">{t('days', { n: 7 })}</TableHead>
                <TableHead className="text-right">{t('days', { n: 30 })}</TableHead>
                <TableHead className="text-right">{t('days', { n: 90 })}</TableHead>
                <TableHead className="text-right">{t('avg')}</TableHead>
                <TableHead className="text-right">{t('best')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.a.id}>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      <PlatformIcon platform={r.a.platform} />
                      {PLATFORM_META[r.a.platform].label}
                      <span className="font-normal text-muted-foreground">{scope.project ? r.a.handle : projectList.find((p) => p.id === r.a.projectId)?.name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular">{r.now === null ? '—' : f.num(r.now)}</TableCell>
                  {cell(r.d7)}
                  {cell(r.d30)}
                  {cell(r.d90)}
                  <TableCell className="text-right tabular">{r.avg === null ? '—' : new Intl.NumberFormat(f.locale, { maximumFractionDigits: 1 }).format(r.avg)}</TableCell>
                  {cell(r.best)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <FollowersChart range={RANGE} days={series.days} series={seriesByPlatform(accs, series.byAccount)} />
      </div>
    </>
  );
}
