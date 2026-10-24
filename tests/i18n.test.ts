import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import ru from '@/messages/ru.json';
import uk from '@/messages/uk.json';

type Tree = { [k: string]: string | string[] | Tree };
const ALL = { en, ru, uk } as Record<string, Tree>;

function leaves(t: Tree, prefix = ''): [string, string | string[]][] {
  return Object.entries(t).flatMap(([k, v]) => (typeof v === 'object' && !Array.isArray(v) ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]));
}

describe('messages', () => {
  const ruKeys = leaves(ru as Tree).map(([k]) => k).sort();

  it.each(['en', 'uk'])('%s has exactly the same keys as ru', (l) => {
    expect(leaves(ALL[l]).map(([k]) => k).sort()).toEqual(ruKeys);
  });

  it.each(['en', 'ru', 'uk'])('%s: every message formats (valid ICU, placeholders filled)', (l) => {
    const errors: string[] = [];
    const t = createTranslator({ locale: l, messages: ALL[l], onError: (e) => errors.push(e.message) });
    const values = new Proxy({}, { get: (_, k) => (k === 'n' || k === 'followers' || k === 'share' ? 3 : `x`), has: () => true });
    for (const [key, v] of leaves(ALL[l])) {
      if (Array.isArray(v)) continue;
      const vars = Object.fromEntries([...v.matchAll(/\{(\w+)/g)].map((m) => [m[1], (values as Record<string, unknown>)[m[1]]]));
      t(key as never, vars as never);
    }
    expect(errors).toEqual([]);
  });
});
