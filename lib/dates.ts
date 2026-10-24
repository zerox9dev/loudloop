import { format, subDays } from 'date-fns';

/** Local calendar day (container TZ) as YYYY-MM-DD. */
export const dayKey = (d: Date = new Date()) => format(d, 'yyyy-MM-dd');
export const monthKey = (d: Date = new Date()) => format(d, 'yyyy-MM');
export const daysAgo = (n: number, from: Date = new Date()) => subDays(from, n);
