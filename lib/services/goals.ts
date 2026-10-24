import { getDaysInMonth } from 'date-fns';

export type GoalInput = {
  /** followers at the start of the month (last snapshot before day 1) */
  start: number;
  current: number;
  target: number;
  /** "today" in local time */
  now: Date;
};

export type GoalProgress = {
  /** share of the month's planned growth already achieved, 0..100 */
  percent: number;
  /** where we should be today if growing evenly, 0..100 */
  pacePercent: number;
  remaining: number;
  daysLeft: number;
  /** followers per day needed to hit the target (including today) */
  perDayNeeded: number;
  /** followers per day planned at month start */
  plannedPerDay: number;
  ahead: boolean;
  reached: boolean;
};

export function computeGoal({ start, current, target, now }: GoalInput): GoalProgress {
  const days = getDaysInMonth(now);
  const day = now.getDate();
  const plan = Math.max(target - start, 1);
  const gained = current - start;
  const percent = clamp((gained / plan) * 100);
  const pacePercent = clamp(((day - 1) / days) * 100);
  const remaining = Math.max(target - current, 0);
  const daysLeft = days - day + 1;
  return {
    percent,
    pacePercent,
    remaining,
    daysLeft,
    perDayNeeded: Math.ceil(remaining / daysLeft),
    plannedPerDay: Math.ceil(plan / days),
    ahead: percent >= pacePercent,
    reached: current >= target,
  };
}

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
