import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { slugify } = await import('@/lib/projects');

describe('slugify', () => {
  it('transliterates cyrillic and normalizes', () => {
    expect(slugify('Личное')).toBe('lichnoe');
    expect(slugify('Pet-проект 2.0!')).toBe('pet-proekt-2-0');
    expect(slugify('Щедрий Їжак')).toBe('schedriy-yizhak');
  });
  it('never returns an empty slug', () => {
    expect(slugify('!!!')).toBe('project');
  });
});
