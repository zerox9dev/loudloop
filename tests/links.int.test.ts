import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql, links, projects } from '@/lib/db';
import { trackLinks } from '@/lib/services/links';

const dbUp = await sql`select 1`.then(() => true, () => false);

describe.skipIf(!dbUp)('trackLinks (integration)', () => {
  afterAll(async () => {
    await sql.end();
  });

  it('tags each URL token separately, even when one is a prefix of another', async () => {
    delete process.env.LINKS_BASE_URL;
    const [p] = await db.select().from(projects).limit(1);
    const out = await trackLinks('Docs https://a.dev/x and https://a.dev/x/y.', { projectId: p.id, projectSlug: 'demo', targetId: -1, postId: 7, platform: 'x' });
    expect(out).toBe(
      'Docs https://a.dev/x?utm_source=x&utm_medium=social&utm_campaign=demo&utm_content=post-7 and https://a.dev/x/y?utm_source=x&utm_medium=social&utm_campaign=demo&utm_content=post-7.',
    );
  });

  it('creates stable short links when LINKS_BASE_URL is set', async () => {
    process.env.LINKS_BASE_URL = 'https://go.example.com';
    const [p] = await db.select().from(projects).limit(1);
    const ctx = { projectId: p.id, projectSlug: 'demo', targetId: null as never, postId: 8, platform: 'threads' as const };
    const first = await trackLinks('see https://a.dev/z', ctx);
    expect(first).toMatch(/^see https:\/\/go\.example\.com\/l\/[A-Za-z0-9]{7}$/);
    const code = first.split('/l/')[1];
    const [row] = await db.select().from(links).where(eq(links.code, code));
    expect(row.url).toContain('utm_source=threads');
    await db.delete(links).where(eq(links.id, row.id));
    delete process.env.LINKS_BASE_URL;
  });
});
