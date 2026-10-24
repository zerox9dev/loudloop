import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { startOfMonth } from 'date-fns';
import { db, goals, insights, metricSnapshots, postTargets, profileViews, type Account } from '@/lib/db';
import { dayKey, daysAgo, monthKey } from '@/lib/dates';
import { computeGoal, type GoalProgress } from './goals';

export type AccountSummary = {
  account: Account;
  followers: number;
  /** false when the platform never reported followers (e.g. LinkedIn member profiles) */
  hasFollowers: boolean;
  yesterday: number | null;
  today: number | null;
  periodGrowth: number | null;
  views: number;
  reactions: number;
  goal: (GoalProgress & { target: number; start: number }) | null;
  insight: { emoji: string; text: string } | null;
};

async function followersOn(accountId: number, day: string, mode: 'lte' | 'lt' = 'lte') {
  const [row] = await db
    .select({ followers: metricSnapshots.followers })
    .from(metricSnapshots)
    .where(and(eq(metricSnapshots.accountId, accountId), mode === 'lte' ? lte(metricSnapshots.day, day) : lt(metricSnapshots.day, day)))
    .orderBy(desc(metricSnapshots.day))
    .limit(1);
  return row?.followers ?? null;
}

export async function summarizeAccount(account: Account, rangeDays: number, now = new Date()): Promise<AccountSummary> {
  const today = dayKey(now);
  const yesterday = dayKey(daysAgo(1, now));
  const beforeYesterday = dayKey(daysAgo(2, now));
  const rangeStart = dayKey(daysAgo(rangeDays, now));

  const [current, yest, before, startOfRange] = await Promise.all([
    followersOn(account.id, today),
    followersOn(account.id, yesterday),
    followersOn(account.id, beforeYesterday),
    followersOn(account.id, rangeStart),
  ]);
  const followers = current ?? 0;

  const [agg] = await db
    .select({
      views: sql<number>`coalesce(sum(${postTargets.views}), 0)::int`,
      reactions: sql<number>`coalesce(sum(${postTargets.reactions}), 0)::int`,
    })
    .from(postTargets)
    .where(and(eq(postTargets.accountId, account.id), eq(postTargets.status, 'published'), gte(postTargets.publishedAt, daysAgo(rangeDays, now))));

  const [goalRow] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.accountId, account.id), eq(goals.month, monthKey(now))));
  let goal: AccountSummary['goal'] = null;
  if (goalRow) {
    const monthStart = dayKey(startOfMonth(now));
    const start = (await followersOn(account.id, monthStart, 'lt')) ?? (await firstFollowersFrom(account.id, monthStart)) ?? followers;
    goal = { ...computeGoal({ start, current: followers, target: goalRow.target, now }), target: goalRow.target, start };
  }

  const [ins] = await db
    .select({ emoji: insights.emoji, text: insights.text })
    .from(insights)
    .where(and(eq(insights.accountId, account.id), lte(insights.day, today)))
    .orderBy(desc(insights.day))
    .limit(1);

  return {
    account,
    followers,
    hasFollowers: current !== null,
    today: current !== null && yest !== null ? current - yest : null,
    yesterday: yest !== null && before !== null ? yest - before : null,
    periodGrowth: current !== null && startOfRange !== null ? current - startOfRange : current !== null ? current - ((await firstFollowersFrom(account.id, rangeStart)) ?? current) : null,
    views: agg?.views ?? 0,
    reactions: agg?.reactions ?? 0,
    goal,
    insight: ins ?? null,
  };
}

async function firstFollowersFrom(accountId: number, day: string) {
  const [row] = await db
    .select({ followers: metricSnapshots.followers })
    .from(metricSnapshots)
    .where(and(eq(metricSnapshots.accountId, accountId), gte(metricSnapshots.day, day)))
    .orderBy(asc(metricSnapshots.day))
    .limit(1);
  return row?.followers ?? null;
}

/** Days back to the oldest post or follower snapshot of these accounts, for the all-time range. */
export async function historyDays(accountIds: number[], now = new Date()) {
  if (accountIds.length === 0) return 30;
  const [[post], [snap]] = await Promise.all([
    db.select({ first: sql<Date | null>`min(${postTargets.publishedAt})` }).from(postTargets).where(and(inArray(postTargets.accountId, accountIds), eq(postTargets.status, 'published'))),
    db.select({ first: sql<string | null>`min(${metricSnapshots.day})` }).from(metricSnapshots).where(inArray(metricSnapshots.accountId, accountIds)),
  ]);
  const firsts = [post?.first ? new Date(post.first) : null, snap?.first ? new Date(snap.first) : null].filter((d): d is Date => d !== null);
  if (firsts.length === 0) return 30;
  const oldest = Math.min(...firsts.map((d) => d.getTime()));
  return Math.max(Math.ceil((now.getTime() - oldest) / 86400_000), 7);
}

export type SeriesPoint = { day: string } & Record<string, number | string>;

/** Followers per day per platform, forward-filled, for the overview chart. */
export async function followerSeries(accountIds: number[], rangeDays: number, now = new Date()) {
  if (accountIds.length === 0) return { days: [] as string[], byAccount: {} as Record<number, (number | null)[]> };
  const from = dayKey(daysAgo(rangeDays, now));
  const rows = await db
    .select({ accountId: metricSnapshots.accountId, day: metricSnapshots.day, followers: metricSnapshots.followers })
    .from(metricSnapshots)
    .where(and(inArray(metricSnapshots.accountId, accountIds), gte(metricSnapshots.day, from)))
    .orderBy(asc(metricSnapshots.day));

  const days: string[] = [];
  for (let i = rangeDays; i >= 0; i--) days.push(dayKey(daysAgo(i, now)));
  const byAccount: Record<number, (number | null)[]> = {};
  for (const id of accountIds) {
    const map = new Map(rows.filter((r) => r.accountId === id).map((r) => [r.day, r.followers]));
    let last: number | null = null;
    byAccount[id] = days.map((d) => {
      if (map.has(d)) last = map.get(d)!;
      return last;
    });
  }
  return { days, byAccount };
}


/** Consecutive days (ending today or yesterday) with at least one published post on the account. */
export async function publishingStreak(accountId: number, now = new Date()) {
  const rows = await db
    .selectDistinct({ day: sql<string>`to_char(${postTargets.publishedAt} at time zone current_setting('TimeZone'), 'YYYY-MM-DD')` })
    .from(postTargets)
    .where(and(eq(postTargets.accountId, accountId), eq(postTargets.status, 'published'), gte(postTargets.publishedAt, daysAgo(120, now))));
  const days = new Set(rows.map((r) => r.day));
  let i = days.has(dayKey(now)) ? 0 : 1;
  let streak = 0;
  while (days.has(dayKey(daysAgo(i, now)))) {
    streak++;
    i++;
  }
  return streak;
}

/** One series per platform; in the cross-project view same-platform accounts are summed. */
/** Profile views per day per platform (summed across accounts); platforms without any data are left out. */
export async function viewSeriesByPlatform(accs: { id: number; platform: Account['platform'] }[], days: string[]) {
  if (accs.length === 0 || days.length === 0) return [];
  const rows = await db
    .select({ accountId: profileViews.accountId, day: profileViews.day, views: profileViews.views })
    .from(profileViews)
    .where(and(inArray(profileViews.accountId, accs.map((a) => a.id)), gte(profileViews.day, days[0])));
  const platformOf = new Map(accs.map((a) => [a.id, a.platform]));
  const index = new Map(days.map((d, i) => [d, i]));
  const out = new Map<Account['platform'], (number | null)[]>();
  for (const r of rows) {
    const i = index.get(r.day);
    const platform = platformOf.get(r.accountId);
    if (i === undefined || !platform) continue;
    const values = out.get(platform) ?? days.map(() => null);
    values[i] = (values[i] ?? 0) + r.views;
    out.set(platform, values);
  }
  return [...out].map(([platform, values]) => ({ platform, values }));
}

export function seriesByPlatform(accs: { id: number; platform: Account['platform'] }[], byAccount: Record<number, (number | null)[]>) {
  const out = new Map<Account['platform'], (number | null)[]>();
  for (const a of accs) {
    const raw = byAccount[a.id] ?? [];
    // series are forward-filled already; back-fill the leading gap so a late first snapshot
    // doesn't read as a sudden jump (or a dip) in the summed line
    const first = raw.find((v) => v !== null) ?? null;
    const values = first === null ? raw : raw.map((v) => v ?? first);
    const prev = out.get(a.platform);
    out.set(a.platform, prev ? prev.map((v, i) => (v === null && values[i] === null ? null : (v ?? 0) + (values[i] ?? 0))) : values);
  }
  return [...out].map(([platform, values]) => ({ platform, values }));
}
