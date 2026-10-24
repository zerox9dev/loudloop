import { getTranslations } from 'next-intl/server';
import { getFormat } from '@/lib/i18n/server';
import { and, gte, lte } from 'drizzle-orm';
import type { ChartSeries } from './followers-chart';
import { db, challenges, type Platform } from '@/lib/db';
import { followerSeries, historyDays, publishingStreak, seriesByPlatform, summarizeAccount } from '@/lib/services/analytics';
import { inScope, listProjects, scopeAccounts, type Scope } from '@/lib/projects';
import { ALL_TIME, isPlatform, RANGES } from '@/lib/platforms';
import { dayKey } from '@/lib/dates';
import { isActive } from '@/lib/providers';
import { GoalCard } from './goal-card';
import { FollowersChart } from './followers-chart';
import { GoalsDialog } from './goals-dialog';


export function parseOverviewParams(sp: Record<string, string | string[] | undefined>) {
  const raw = typeof sp.p === 'string' ? sp.p.split(',').filter(isPlatform) : [];
  const r = sp.range === undefined ? NaN : Number(sp.range);
  return { selected: raw.length ? (raw as Platform[]) : null, range: (RANGES as readonly number[]).includes(r) ? r : 30 };
}

export async function OverviewBody({ scope, selected, range, readOnly = false }: { scope: Scope; selected: Platform[] | null; range: number; readOnly?: boolean }) {
  const now = new Date();
  const [all, projectList] = await Promise.all([scopeAccounts(scope).then((r) => r.filter(isActive)), listProjects()]);
  const projectName = (id: number) => projectList.find((p) => p.id === id)?.name;
  const visible = all.filter((a) => !selected || selected.includes(a.platform));
  const today = dayKey(now);
  const activeChallenges = await db
    .select({ accountId: challenges.accountId })
    .from(challenges)
    .where(and(lte(challenges.startsOn, today), gte(challenges.endsOn, today), inScope(challenges.projectId, scope)));
  const challenged = new Set(activeChallenges.map((c) => c.accountId));
  const days = range === ALL_TIME ? await historyDays(visible.map((a) => a.id), now) : range;

  const [summaries, series] = await Promise.all([
    Promise.all(
      visible.map(async (a) => ({
        s: await summarizeAccount(a, days, now),
        streak: challenged.has(a.id) || challenged.has(null) ? await publishingStreak(a.id, now) : 0,
      })),
    ),
    followerSeries(visible.map((a) => a.id), days, now),
  ]);
  const [t, f] = await Promise.all([getTranslations('overview'), getFormat()]);
  const monthLabel = f.date(now, 'LLLL');

  const chartSeries: ChartSeries[] = seriesByPlatform(visible, series.byAccount);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-8">
      <section aria-labelledby="goals-title">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 id="goals-title" className="text-[19px] font-semibold">
            {t('goalsFor', { month: monthLabel })}
          </h2>
          {!readOnly && (
            <GoalsDialog
              monthLabel={monthLabel}
              rows={summaries.map(({ s }) => ({ accountId: s.account.id, platform: s.account.platform, handle: s.account.handle, followers: s.followers, target: s.goal?.target ?? null }))}
            />
          )}
        </div>
        {summaries.length === 0 ? (
          <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">{t('noChannels')}</p>
        ) : (
          <div className="grid overflow-hidden rounded-lg border bg-card md:grid-cols-2 [&>*]:border-b md:[&>*:nth-child(odd)]:border-r md:[&>*:nth-last-child(2):nth-child(odd)]:border-b-0 [&>*:last-child]:border-b-0 md:[&>*:last-child:nth-child(odd)]:col-span-2 md:[&>*:last-child:nth-child(odd)]:border-r-0">
            {summaries.map(({ s, streak }) => (
              <GoalCard key={s.account.id} s={s} streak={streak} projectName={scope.project ? undefined : projectName(s.account.projectId)} />
            ))}
          </div>
        )}
      </section>
      <FollowersChart
        range={days}
        days={series.days}
        series={chartSeries}
      />
    </div>
  );
}

