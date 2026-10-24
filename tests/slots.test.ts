import { describe, expect, it } from 'vitest';
import { slotTimes } from '@/lib/services/slots';

describe('slotTimes', () => {
  // Friday 24 Oct 2026, 12:00 local
  const from = new Date(2026, 9, 24 - 1, 12, 0); // Fri 23 Oct

  it('lists future slots in order and skips the past part of today', () => {
    const res = slotTimes([{ weekday: 5, time: '10:00' }, { weekday: 5, time: '18:30' }, { weekday: 1, time: '09:00' }], from, 8);
    expect(res.map((d) => `${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`)).toEqual(['23 18:30', '26 9:00', '30 10:00', '30 18:30']);
  });

  it('returns nothing without slot definitions', () => {
    expect(slotTimes([], from)).toEqual([]);
  });
});
