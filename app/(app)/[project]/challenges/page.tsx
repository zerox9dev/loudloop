import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { getTranslations } from 'next-intl/server';
import { getFormat } from '@/lib/i18n/server';
import { db, accounts, challenges, postTargets } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { PlatformIcon } from '@/components/platform-icon';
import { ChallengeForm, DeleteChallenge } from '@/components/challenge-form';
import { dayKey } from '@/lib/dates';
import { PLATFORM_META } from '@/lib/platforms';
import { isActive } from '@/lib/providers';
import { inScope, resolveScope, scopeAccounts } from '@/lib/projects';

async function dailyCounts(projectId: number, accountId: number | null, from: string, to: string) {
  const day = sql<string>`to_char(${postTargets.publishedAt} at time zone current_setting('TimeZone'), 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day, n: sql<number>`count(distinct ${postTargets.postId})::int` })
    .from(postTargets)
    .where(
      and(
        eq(postTargets.status, 'published'),
        accountId ? eq(postTargets.accountId, accountId) : inArray(postTargets.accountId, db.select({ id: accounts.id }).from(accounts).where(eq(accounts.projectId, projectId))),
        gte(postTargets.publishedAt, parseISO(from)),
        lte(postTargets.publishedAt, addDays(parseISO(to), 1)),
      ),
    )
    .groupBy(day);
  return new Map(rows.map((r) => [r.day, r.n]));
}

export default async function ChallengesPage({ params }: PageProps<'/[project]/challenges'>) {
  const scope = await resolveScope((await params).project);
  const [t, f] = await Promise.all([getTranslations('challenges'), getFormat()]);
  const [list, accs] = await Promise.all([
    db.select().from(challenges).where(inScope(challenges.projectId, scope)).orderBy(asc(challenges.startsOn)),
    scopeAccounts(scope),
  ]);
  const now = new Date();
  const today = dayKey(now);

  const cards = await Promise.all(
    list.map(async (c) => {
      const counts = await dailyCounts(c.projectId, c.accountId, c.startsOn, c.endsOn);
      const total = differenceInCalendarDays(parseISO(c.endsOn), parseISO(c.startsOn)) + 1;
      const elapsed = Math.min(Math.max(differenceInCalendarDays(now, parseISO(c.startsOn)) + 1, 0), total);
      const days = Array.from({ length: total }, (_, i) => {
        const d = dayKey(addDays(parseISO(c.startsOn), i));
        return { d, met: (counts.get(d) ?? 0) >= c.postsPerDay, future: d > today, today: d === today };
      });
      let streak = 0;
      for (let i = elapsed - 1; i >= 0; i--) {
        if (days[i].met) streak++;
        else if (!days[i].today) break;
      }
      return { c, days, met: days.filter((d) => d.met).length, elapsed, total, streak, account: accs.find((a) => a.id === c.accountId) };
    }),
  );

  return (
    <>
      <PageHeader title={t('title')}>
        {scope.project && (
          <ChallengeForm projectId={scope.project.id} accounts={accs.filter(isActive).map((a) => ({ id: a.id, platform: a.platform, handle: a.handle }))} />
        )}
      </PageHeader>
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-8">
        {cards.length === 0 && <p className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{t('empty')}</p>}
        {cards.map(({ c, days, met, elapsed, total, streak, account }) => (
          <section key={c.id} className="rounded-lg border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-[17px] font-semibold">
                  {account && <PlatformIcon platform={account.platform} />}
                  {c.title}
                  {streak >= 2 && <span className="rounded-md bg-muted px-2 py-0.5 text-[13px] font-medium tabular">🔥 {streak}</span>}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {account ? `${PLATFORM_META[account.platform].label} ${account.handle}` : t('anyChannel')} · {t('perDay', { n: c.postsPerDay })} ·{' '}
                  {f.date(parseISO(c.startsOn), 'd MMM')} — {f.date(parseISO(c.endsOn), 'd MMM')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular">
                    {met}/{elapsed}
                  </div>
                  <div className="text-xs text-muted-foreground">{t('ofDays', { n: total })}</div>
                </div>
                <DeleteChallenge id={c.id} />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-1.5" aria-label={t('days')}>
              {days.map((d) => (
                <span
                  key={d.d}
                  title={`${f.date(parseISO(d.d), 'd MMMM')}: ${d.met ? t('done') : d.future ? t('ahead') : t('missed')}`}
                  className={`size-5 rounded-md ${d.met ? 'bg-positive' : d.future ? 'bg-muted' : d.today ? 'border-2 border-dashed border-foreground/30' : 'bg-destructive/25'}`}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

