import { ruIssues } from './helpers/i18n';
import { describe, expect, it } from 'vitest';
import { withUtm } from '@/lib/services/links';

describe('withUtm', () => {
  it('tags a plain URL', () => {
    expect(withUtm('https://myapp.dev/pricing?x=1', { source: 'x', campaign: 'pet-project', content: 'post-7' })).toBe(
      'https://myapp.dev/pricing?x=1&utm_source=x&utm_medium=social&utm_campaign=pet-project&utm_content=post-7',
    );
  });
  it('keeps URLs that already have UTM tags', () => {
    const u = 'https://a.dev/?utm_source=newsletter';
    expect(withUtm(u, { source: 'x', campaign: 'c', content: 'p' })).toBe(u);
  });
  it('leaves non-URLs alone', () => {
    expect(withUtm('not a url', { source: 'x', campaign: 'c', content: 'p' })).toBe('not a url');
  });
});

describe('length and link rewriting', () => {
  it('X counts any link as 23 characters, so UTM tags never change its length', async () => {
    const { platformTextLength } = await import('@/lib/services/validate');
    const a = 'Новое: https://myapp.dev';
    const b = 'Новое: https://myapp.dev/?utm_source=x&utm_medium=social&utm_campaign=pet-project&utm_content=post-123';
    expect(platformTextLength('x', a)).toBe(platformTextLength('x', b));
    expect(platformTextLength('threads', b)).toBeGreaterThan(platformTextLength('threads', a));
  });

  it('an emptied variant falls back to the base text in validation', async () => {
    const { validateCompose } = await import('@/lib/services/validate');
    const long = 'x'.repeat(300);
    expect(ruIssues(validateCompose({ kind: 'post', text: long, media: [], platforms: ['x'], variants: { x: '' } }))).toEqual(['X: текст длиннее 280 символов (300)']);
    expect(ruIssues(validateCompose({ kind: 'post', text: 'ok', media: [], platforms: ['x'], variants: { x: '   ' } }))).toEqual([]);
  });
});
