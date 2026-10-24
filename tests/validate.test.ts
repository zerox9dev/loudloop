import { ruIssues } from './helpers/i18n';
import { describe, expect, it } from 'vitest';
import { validateCompose } from '@/lib/services/validate';

const img = { path: 'a.jpg', mime: 'image/jpeg' };

describe('validateCompose', () => {
  it('requires a platform and content', () => {
    expect(ruIssues(validateCompose({ kind: 'post', text: '', media: [], platforms: [] }))).toEqual([
      'Выберите хотя бы одну площадку',
      'Пустой пост: добавьте текст или медиа',
    ]);
  });

  it('enforces per-platform text limits', () => {
    const errs = ruIssues(validateCompose({ kind: 'post', text: 'x'.repeat(300), media: [], platforms: ['telegram', 'x', 'threads'] }));
    expect(errs).toEqual(['X: текст длиннее 280 символов (300)']);
  });

  it('rejects unsupported formats and missing media', () => {
    const errs = ruIssues(validateCompose({ kind: 'story', text: 'hi', media: [], platforms: ['instagram', 'x'] }));
    expect(errs).toContain('Instagram: для формата «Сторис» нужно медиа');
    expect(errs).toContain('X: формат «Сторис» не поддерживается');
  });

  it('accepts a valid instagram photo', () => {
    expect(ruIssues(validateCompose({ kind: 'photo', text: 'hi', media: [img], platforms: ['instagram'] }))).toEqual([]);
  });

  it('reels must be video', () => {
    expect(ruIssues(validateCompose({ kind: 'reel', text: '', media: [img], platforms: ['instagram'] }))).toEqual(['Instagram: рилс — это видео']);
  });
});
