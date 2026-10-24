import { describe, expect, it } from 'vitest';
import { computeGoal } from '@/lib/services/goals';

describe('computeGoal', () => {
  const now = new Date(2026, 9, 19); // 19 Oct, 31-day month

  it('measures progress against planned monthly growth, not absolute target', () => {
    const g = computeGoal({ start: 5540, current: 6021, target: 7000, now });
    expect(g.percent).toBe(33);
    expect(g.remaining).toBe(979);
    expect(g.daysLeft).toBe(13);
    expect(g.perDayNeeded).toBe(76);
    expect(g.ahead).toBe(false);
  });

  it('places pace marker by elapsed days', () => {
    expect(computeGoal({ start: 0, current: 0, target: 31, now }).pacePercent).toBe(58);
  });

  it('caps at 100 and flags reached', () => {
    const g = computeGoal({ start: 100, current: 250, target: 200, now });
    expect(g.percent).toBe(100);
    expect(g.reached).toBe(true);
    expect(g.perDayNeeded).toBe(0);
  });

  it('never divides by zero when target equals start', () => {
    expect(computeGoal({ start: 100, current: 100, target: 100, now }).percent).toBe(0);
  });
});
