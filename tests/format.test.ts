import { describe, expect, it } from 'vitest';
import { makeFormat } from '@/lib/i18n/format';

const norm = (s: string) => s.replace(/\s/g, ' ');

describe('makeFormat', () => {
  it('groups numbers per locale', () => {
    expect(norm(makeFormat('ru').num(6021))).toBe('6 021');
    expect(norm(makeFormat('uk').num(6021))).toBe('6 021');
    expect(makeFormat('en').num(6021)).toBe('6,021');
  });

  it('signs deltas with a real minus', () => {
    expect(norm(makeFormat('ru').signed(-12))).toBe('−12');
    expect(makeFormat('en').signed(1005)).toBe('+1,005');
    expect(makeFormat('en').signed(0)).toBe('0');
  });

  it('localizes month names', () => {
    const d = new Date(2026, 9, 24);
    expect(makeFormat('en').date(d, 'd MMM')).toBe('24 Oct');
    expect(makeFormat('ru').date(d, 'LLLL')).toBe('октябрь');
    expect(makeFormat('uk').date(d, 'LLLL')).toBe('жовтень');
  });
});
