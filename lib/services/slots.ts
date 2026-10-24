import { and, eq, gte, inArray } from 'drizzle-orm';
import { addDays, getISODay, setHours, setMinutes, startOfMinute } from 'date-fns';
import { db, posts, postTargets, slots } from '@/lib/db';

/** Sensible default rhythm when an account has no slots yet: weekdays at 10:00. */
export const DEFAULT_SLOTS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, time: '10:00' }));

/** Candidate slot datetimes from `from` forward, in chronological order. */
export function slotTimes(defs: { weekday: number; time: string }[], from: Date, days = 28): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    for (const s of defs) {
      if (getISODay(day) !== s.weekday) continue;
      const [h, m] = s.time.split(':').map(Number);
      const at = startOfMinute(setMinutes(setHours(day, h), m));
      if (at > from) out.push(at);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * The next free slot for a post going to these accounts: slots of the first (primary) account,
 * skipping times already taken by another queued post on any of the accounts.
 */
export async function nextFreeSlot(accountIds: number[], from = new Date()): Promise<Date> {
  if (accountIds.length === 0) return addDays(from, 1);
  const defs = await db.select({ weekday: slots.weekday, time: slots.time }).from(slots).where(eq(slots.accountId, accountIds[0]));
  const candidates = slotTimes(defs.length ? defs : DEFAULT_SLOTS, from);
  const taken = await db
    .select({ at: posts.scheduledAt })
    .from(posts)
    .innerJoin(postTargets, eq(postTargets.postId, posts.id))
    .where(and(inArray(postTargets.accountId, accountIds), inArray(posts.status, ['scheduled', 'publishing']), gte(posts.scheduledAt, from)));
  const busy = new Set(taken.map((t) => t.at && startOfMinute(t.at).getTime()));
  return candidates.find((c) => !busy.has(c.getTime())) ?? addDays(from, 1);
}
