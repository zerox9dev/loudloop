import { ruIssues } from './helpers/i18n';
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { describe, expect, it } from 'vitest';
import { perItem } from '@/lib/providers/http';
import { loginDelayMs, recordFailure, resetFailures } from '@/lib/auth/rate-limit';

describe('perItem', () => {
  it('keeps partial results when some items fail', async () => {
    const res = await perItem(['a', 'b'], async (id) => {
      if (id === 'a') throw new Error('gone');
      return id.toUpperCase();
    });
    expect([...res]).toEqual([['b', 'B']]);
  });

  it('tolerates a single failing item (deleted media)', async () => {
    expect((await perItem(['a'], async () => Promise.reject(new Error('404')))).size).toBe(0);
  });

  it('throws even for falsy rejection values', async () => {
    await expect(perItem(['a', 'b'], async () => Promise.reject(undefined))).rejects.toThrow('all requests failed');
  });

  it('throws when every item fails so sync can record the error', async () => {
    await expect(perItem(['a', 'b'], async () => Promise.reject(new Error('token expired')))).rejects.toThrow('token expired');
  });

  it('is a no-op for an empty list', async () => {
    expect((await perItem([], async () => 1)).size).toBe(0);
  });
});

describe('login throttling', () => {
  it('grows the delay with each failure, caps it, and resets on success', () => {
    const key = `test-${Math.random()}`;
    expect(loginDelayMs(key)).toBe(0);
    recordFailure(key);
    expect(loginDelayMs(key)).toBe(500);
    for (let i = 0; i < 20; i++) recordFailure(key);
    expect(loginDelayMs(key)).toBe(15_000);
    resetFailures(key);
    expect(loginDelayMs(key)).toBe(0);
  });
});

describe('round-4 fixes', () => {
  it('LinkedIn limit counts the escaped text', async () => {
    const { validateCompose } = await import('@/lib/services/validate');
    const text = '#'.repeat(1600); // 1600 raw, 3200 after escaping
    expect(ruIssues(validateCompose({ kind: 'post', text, media: [], platforms: ['linkedin'] }))).toEqual(['LinkedIn: текст длиннее 3000 символов (3200)']);
    expect(ruIssues(validateCompose({ kind: 'post', text, media: [], platforms: ['telegram'] }))).toEqual([]);
  });

  it('summing accounts per platform back-fills a late first snapshot instead of jumping', async () => {
    const { seriesByPlatform } = await import('@/lib/services/analytics');
    const res = seriesByPlatform(
      [
        { id: 1, platform: 'telegram' },
        { id: 2, platform: 'telegram' },
      ],
      { 1: [100, 101, 102], 2: [null, 50, 51] },
    );
    expect(res).toEqual([{ platform: 'telegram', values: [150, 151, 153] }]);
  });
});
