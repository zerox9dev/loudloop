import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { subDays } from 'date-fns';
import { Info } from 'lucide-react';
import { db, accounts, linkClicks, links, postTargets, posts } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { ClicksChart } from '@/components/clicks-chart';
import { PlatformIcon } from '@/components/platform-icon';
import { ProjectTile } from '@/components/project-switcher';
import { inScope, listProjects, resolveScope } from '@/lib/projects';
import { PLATFORM_META } from '@/lib/platforms';
import { dayKey, daysAgo } from '@/lib/dates';
import { getTranslations } from 'next-intl/server';
import { getFormat } from '@/lib/i18n/server';
import { linksBase } from '@/lib/services/links';

const RANGE = 30;

export default async function ClicksPage({ params }: PageProps<'/[project]/clicks'>) {
  const scope = await resolveScope((await params).project);
  const [t, f] = await Promise.all([getTranslations('clicks'), getFormat()]);
  const since = subDays(new Date(), RANGE);
  const dayExpr = sql<string>`to_char(${linkClicks.at} at time zone current_setting('TimeZone'), 'YYYY-MM-DD')`;
  const [list, daily, byProject, byPlatform, topPosts] = await Promise.all([
    listProjects(),
    db
      .select({ day: dayExpr, n: sql<number>`count(*)::int` })
      .from(linkClicks)
      .innerJoin(links, eq(links.id, linkClicks.linkId))
      .where(and(inScope(links.projectId, scope), gte(linkClicks.at, since)))
      .groupBy(dayExpr),
    db
      .select({ projectId: links.projectId, n: sql<number>`count(*)::int` })
      .from(linkClicks)
      .innerJoin(links, eq(links.id, linkClicks.linkId))
      .where(and(inScope(links.projectId, scope), gte(linkClicks.at, since)))
      .groupBy(links.projectId),
    db
      .select({ platform: accounts.platform, n: sql<number>`count(*)::int` })
      .from(linkClicks)
      .innerJoin(links, eq(links.id, linkClicks.linkId))
      .innerJoin(postTargets, eq(postTargets.id, links.targetId))
      .innerJoin(accounts, eq(accounts.id, postTargets.accountId))
      .where(and(inScope(links.projectId, scope), gte(linkClicks.at, since)))
      .groupBy(accounts.platform),
    db
      .select({ postId: posts.id, text: posts.text, projectId: posts.projectId, platform: accounts.platform, url: postTargets.url, clicks: sql<number>`sum(${links.clicks})::int` })
      .from(links)
      .innerJoin(postTargets, eq(postTargets.id, links.targetId))
      .innerJoin(posts, eq(posts.id, postTargets.postId))
      .innerJoin(accounts, eq(accounts.id, postTargets.accountId))
      .where(inScope(links.projectId, scope))
      .groupBy(posts.id, accounts.platform, postTargets.url)
      .orderBy(desc(sql`sum(${links.clicks})`))
      .limit(20),
  ]);
  const byDay = new Map(daily.map((d) => [d.day, d.n]));
  const chart = Array.from({ length: RANGE + 1 }, (_, i) => {
    const day = dayKey(daysAgo(RANGE - i));
    return { day, clicks: byDay.get(day) ?? 0 };
  });
  const total = chart.reduce((s, d) => s + d.clicks, 0);
  const project = (id: number) => list.find((p) => p.id === id);

  return (
    <>
      <PageHeader title={t('title')} />
      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:p-8">
        {!linksBase() && (
          <p className="flex gap-2 rounded-lg border bg-muted/40 p-4 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>{t('setup')}</span>
          </p>
        )}
        <section className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[17px] font-semibold">{t('forDays', { n: RANGE })}</h2>
            <span className="text-2xl font-semibold tabular">{f.num(total)}</span>
          </div>
          <ClicksChart data={chart} />
        </section>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-lg border bg-card p-6">
            <h2 className="mb-3 text-[17px] font-semibold">{t('byProject')}</h2>
            <ul className="space-y-2">
              {byProject.length === 0 && <li className="text-sm text-muted-foreground">{t('none')}</li>}
              {byProject.sort((a, b) => b.n - a.n).map((r) => {
                const p = project(r.projectId);
                return (
                  <li key={r.projectId} className="flex items-center gap-2 text-sm">
                    {p && <ProjectTile name={p.name} id={p.id} className="size-5 text-[11px]" />}
                    <span className="flex-1">{p?.name}</span>
                    <span className="font-medium tabular">{f.num(r.n)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="rounded-lg border bg-card p-6">
            <h2 className="mb-3 text-[17px] font-semibold">{t('byPlatform')}</h2>
            <ul className="space-y-2">
              {byPlatform.length === 0 && <li className="text-sm text-muted-foreground">{t('none')}</li>}
              {byPlatform.sort((a, b) => b.n - a.n).map((r) => (
                <li key={r.platform} className="flex items-center gap-2 text-sm">
                  <PlatformIcon platform={r.platform} />
                  <span className="flex-1">{PLATFORM_META[r.platform].label}</span>
                  <span className="font-medium tabular">{f.num(r.n)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section className="rounded-lg border bg-card p-6">
          <h2 className="mb-3 text-[17px] font-semibold">{t('topPosts')}</h2>
          {topPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('topEmpty')}</p>
          ) : (
            <ul className="divide-y">
              {topPosts.map((tp) => (
                <li key={`${tp.postId}-${tp.platform}`} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-10 shrink-0 font-semibold tabular">{f.num(tp.clicks)}</span>
                  <PlatformIcon platform={tp.platform} size={14} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-muted-foreground">{project(tp.projectId)?.name} · </span>
                    {tp.url ? (
                      <a href={tp.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {tp.text}
                      </a>
                    ) : (
                      tp.text
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
