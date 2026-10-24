import Link from 'next/link';
import { and, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { subDays } from 'date-fns';
import { getTranslations } from 'next-intl/server';
import { getFormat } from '@/lib/i18n/server';
import { signalText } from '@/lib/i18n/signals';
import { AlertTriangle, ArrowRight, Lightbulb, MessageSquareReply, MousePointerClick, Sparkles } from 'lucide-react';
import { db, accounts, comments, ideas, linkClicks, links, postTargets, posts, signals } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { ReviewList, type ReviewItem } from '@/components/review-list';
import { FillPipelineButton } from '@/components/fill-pipeline-button';
import { PlatformIcon } from '@/components/platform-icon';
import { ProjectTile } from '@/components/project-switcher';
import { loadPage } from '@/lib/page';
import { inScope, listProjects } from '@/lib/projects';
import { listPosts, platformTexts, toComposerPost } from '@/lib/services/posts';
import { pipelineDepth, PIPELINE_TARGET } from '@/lib/services/factory';
import { isActive } from '@/lib/providers';
import { cn } from '@/lib/utils';

export default async function TodayPage({ params }: PageProps<'/[project]/today'>) {
  const { scope, accounts: composerAccs, projects } = await loadPage(params);
  const [t, tAll, f] = await Promise.all([getTranslations('today'), getTranslations(), getFormat()]);
  const base = `/${scope.slug}`;
  const allProjects = (await listProjects()).filter((p) => scope.projectIds.includes(p.id));
  const projectName = (id: number) => allProjects.find((p) => p.id === id)?.name ?? '';

  const [review, upcoming, depth, newIdeas, accs, unread, latestComments, openSignals, topClicks] = await Promise.all([
    listPosts(scope, { statuses: ['review'], limit: 50 }),
    listPosts(scope, { statuses: ['scheduled'], order: 'upcoming', limit: 200 }),
    pipelineDepth(scope.projectIds),
    db.select({ projectId: ideas.projectId, n: count() }).from(ideas).where(and(eq(ideas.status, 'new'), inScope(ideas.projectId, scope))).groupBy(ideas.projectId),
    db.select().from(accounts).where(inScope(accounts.projectId, scope)),
    db.select({ n: count() }).from(comments).innerJoin(accounts, eq(accounts.id, comments.accountId)).where(and(eq(comments.isRead, false), inScope(accounts.projectId, scope))),
    db
      .select({ c: comments, platform: accounts.platform })
      .from(comments)
      .innerJoin(accounts, eq(accounts.id, comments.accountId))
      .where(and(eq(comments.isRead, false), inScope(accounts.projectId, scope)))
      .orderBy(desc(comments.postedAt))
      .limit(3),
    db.select().from(signals).where(and(isNull(signals.dismissedAt), inScope(signals.projectId, scope))).orderBy(desc(signals.createdAt)).limit(4),
    // clicks that happened in the last 14 days (same basis as the Переходы page)
    db
      .select({ postId: posts.id, text: posts.text, projectId: posts.projectId, clicks: sql<number>`count(*)::int` })
      .from(linkClicks)
      .innerJoin(links, eq(links.id, linkClicks.linkId))
      .innerJoin(postTargets, eq(postTargets.id, links.targetId))
      .innerJoin(posts, eq(posts.id, postTargets.postId))
      .where(and(inScope(links.projectId, scope), gte(linkClicks.at, subDays(new Date(), 14))))
      .groupBy(posts.id)
      .orderBy(desc(sql`count(*)`))
      .limit(3),
  ]);

  const ideaIds = [...new Set(review.map((p) => p.ideaId).filter((x): x is number => x !== null))];
  const ideaTitles = new Map(
    (ideaIds.length ? await db.select({ id: ideas.id, title: ideas.title }).from(ideas).where(inArray(ideas.id, ideaIds)) : []).map((i) => [i.id, i.title]),
  );
  const reviewItems: ReviewItem[] = review.map((p) => {
    const proj = allProjects.find((x) => x.id === p.projectId);
    return { ...toComposerPost(p), projectName: proj?.name ?? '', isFounder: proj?.kind === 'founder', ideaTitle: p.ideaId ? (ideaTitles.get(p.ideaId) ?? null) : null, texts: platformTexts(p) };
  });
  const ideasBy = new Map(newIdeas.map((r) => [r.projectId, r.n]));

  const pipeline = allProjects.map((p) => {
    const pa = accs.filter((a) => a.projectId === p.id && isActive(a));
    const next = upcoming.find((u) => u.projectId === p.id)?.scheduledAt ?? null;
    const d = depth.get(p.id) ?? 0;
    const issues = [
      pa.length === 0 && t('issues.noChannels'),
      !p.brief.about && t('issues.noBrief'),
      pa.length > 0 && d === 0 && t('issues.empty'),
      (ideasBy.get(p.id) ?? 0) === 0 && t('issues.noIdeas'),
    ].filter(Boolean) as string[];
    return { p, accounts: pa, depth: d, next, ideas: ideasBy.get(p.id) ?? 0, issues };
  });

  return (
    <>
      <PageHeader title={t('title')}>
        <FillPipelineButton />
      </PageHeader>
      <div className="mx-auto grid w-full max-w-[1600px] gap-6 p-4 md:p-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-3" aria-labelledby="review-title">
          <h2 id="review-title" className="flex items-center gap-2 text-[17px] font-semibold">
            <Sparkles className="size-4" /> {t('review')}
            <span className="font-normal text-muted-foreground tabular">{reviewItems.length}</span>
          </h2>
          <ReviewList items={reviewItems} accounts={composerAccs} projects={projects} />
        </section>

        <aside className="space-y-6">
          <section className="space-y-3" aria-labelledby="pipeline-title">
            <h2 id="pipeline-title" className="text-[17px] font-semibold">{t('pipeline')}</h2>
            <ul className="divide-y rounded-lg border bg-card">
              {pipeline.map(({ p, accounts: pa, depth: d, next, ideas: n, issues }) => (
                <li key={p.id} className="space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    <ProjectTile name={p.name} id={p.id} className="size-5 text-[11px]" />
                    <Link href={`/${p.slug}/today`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    {p.kind === 'founder' && <span className="text-xs text-muted-foreground">{t('founderBrand')}</span>}
                    <span className="ml-auto flex gap-0.5">
                      {pa.map((a) => (
                        <PlatformIcon key={a.id} platform={a.platform} size={13} />
                      ))}
                    </span>
                  </div>
                  <div className="flex items-center gap-2" aria-label={t('inPipeline', { d, target: PIPELINE_TARGET })}>
                    {Array.from({ length: PIPELINE_TARGET }, (_, i) => (
                      <span key={i} className={cn('h-1.5 flex-1 rounded-sm', i < d ? 'bg-positive' : 'bg-muted')} />
                    ))}
                    <span className="w-8 text-right text-xs tabular text-muted-foreground">{d}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {next ? t('next', { when: f.date(next, 'EEEEEE d MMM, HH:mm') }) : t('nothingScheduled')} · {t('ideasN', { n })}
                  </p>
                  {issues.length > 0 && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" />
                      {issues.join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3" aria-labelledby="replies-title">
            <h2 id="replies-title" className="flex items-center gap-2 text-[17px] font-semibold">
              <MessageSquareReply className="size-4" /> {t('replies')}
              <span className="font-normal text-muted-foreground tabular">{unread[0]?.n ?? 0}</span>
            </h2>
            <ul className="divide-y rounded-lg border bg-card text-sm">
              {latestComments.map(({ c, platform }) => (
                <li key={c.id} className="flex gap-2 p-3">
                  <PlatformIcon platform={platform} size={14} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="truncate">
                      <span className="font-medium">{c.authorName}</span> <span className="text-muted-foreground">{f.ago(c.postedAt)}</span>
                    </p>
                    <p className="truncate text-muted-foreground">{c.text}</p>
                  </div>
                </li>
              ))}
              <li>
                <Link href={`${base}/replies`} className="flex items-center gap-1 p-3 text-sm hover:underline">
                  {t('openInbox')} <ArrowRight className="size-3.5" />
                </Link>
              </li>
            </ul>
          </section>

          {topClicks.length > 0 && (
            <section className="space-y-3" aria-labelledby="clicks-title">
              <h2 id="clicks-title" className="flex items-center gap-2 text-[17px] font-semibold">
                <MousePointerClick className="size-4" /> {t('traffic')}
              </h2>
              <ul className="divide-y rounded-lg border bg-card text-sm">
                {topClicks.map((tc) => (
                  <li key={tc.postId} className="flex gap-3 p-3">
                    <span className="w-10 shrink-0 font-semibold tabular">{f.num(tc.clicks)}</span>
                    <span className="min-w-0 truncate">
                      <span className="text-muted-foreground">{projectName(tc.projectId)} · </span>
                      {tc.text}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {openSignals.length > 0 && (
            <section className="space-y-3" aria-labelledby="signals-title">
              <h2 id="signals-title" className="flex items-center gap-2 text-[17px] font-semibold">
                <Lightbulb className="size-4" /> {t('signals')}
              </h2>
              <ul className="divide-y rounded-lg border bg-card text-sm">
                {openSignals.map((s) => {
                  const st = signalText(s, tAll as never);
                  return (
                    <li key={s.id} className="p-3">
                      <p>{st.title}</p>
                      {st.body && <p className="truncate text-xs text-muted-foreground">{st.body}</p>}
                    </li>
                  );
                })}
                <li>
                  <Link href={`${base}/signals`} className="flex items-center gap-1 p-3 text-sm hover:underline">
                    {t('allSignals')} <ArrowRight className="size-3.5" />
                  </Link>
                </li>
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

