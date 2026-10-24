import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, sql, ideas, posts, postTargets, projects } from '@/lib/db';

vi.mock('server-only', () => ({}));
// keep the queue out of this test
vi.mock('@/lib/queue', () => ({ schedulePost: vi.fn(), unschedulePost: vi.fn(), enqueueBackfill: vi.fn(), redis: vi.fn() }));
delete process.env.ANTHROPIC_API_KEY; // deterministic template drafts

const dbUp = await sql`select 1`.then(() => true, () => false);

describe.skipIf(!dbUp)('factory (integration)', async () => {
  const { draftsFromIdea, approvePosts } = await import('@/lib/services/factory');
  const createdIdeas: number[] = [];
  let founderBrief: unknown;

  afterAll(async () => {
    const ps = await db.select({ id: posts.id }).from(posts).where(inArray(posts.ideaId, createdIdeas.length ? createdIdeas : [-1]));
    for (const p of ps) await db.delete(posts).where(eq(posts.id, p.id));
    for (const id of createdIdeas) await db.delete(ideas).where(eq(ideas.id, id));
    if (founderBrief) await db.update(projects).set({ brief: founderBrief as never }).where(eq(projects.kind, 'founder'));
    await sql.end();
  });

  async function newIdea(title: string) {
    const [pet] = await db.select().from(projects).where(eq(projects.slug, 'pet-project'));
    const [i] = await db.insert(ideas).values({ projectId: pet.id, title, body: 'детали', url: 'https://pet.example.com/x' }).returning();
    createdIdeas.push(i.id);
    return i;
  }

  it('one product idea → a product draft and a founder draft, each with per-platform texts within limits', async () => {
    const idea = await newIdea('Тест: фича экспорта');
    const res = await draftsFromIdea(idea.id, ['product', 'founder']);
    expect(res.created.map((c) => c.angle).sort()).toEqual(['founder', 'product']);
    const rows = await db.select().from(posts).where(eq(posts.ideaId, idea.id));
    expect(rows.every((r) => r.status === 'review')).toBe(true);
    const targets = await db.select().from(postTargets).where(inArray(postTargets.postId, rows.map((r) => r.id)));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((t) => t.text && t.text.length > 0)).toBe(true);
    const [after] = await db.select().from(ideas).where(eq(ideas.id, idea.id));
    expect(after.status).toBe('drafted');
  });

  it('respects the founder promo share', async () => {
    const [founder] = await db.select().from(projects).where(eq(projects.kind, 'founder'));
    founderBrief = founder.brief;
    await db.update(projects).set({ brief: { ...founder.brief, promoShare: 0 } }).where(eq(projects.id, founder.id));
    const idea = await newIdea('Тест: лимит промо');
    const res = await draftsFromIdea(idea.id, ['product', 'founder']);
    expect(res.created.map((c) => c.angle)).toEqual(['product']);
    expect(res.skipped).toEqual([{ code: 'promoCap', values: { share: 0 } }]);
  });

  it('approve puts drafts into the next free slot', async () => {
    const idea = await newIdea('Тест: одобрение');
    const res = await draftsFromIdea(idea.id, ['product']);
    const done = await approvePosts([res.created[0].postId], 'queue');
    expect(done).toHaveLength(1);
    expect(done[0].at.getTime()).toBeGreaterThan(Date.now());
    const [p] = await db.select().from(posts).where(eq(posts.id, res.created[0].postId));
    expect(p.status).toBe('scheduled');
  });
});
