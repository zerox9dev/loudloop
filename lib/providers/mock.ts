import { desc, eq } from 'drizzle-orm';
import { db, metricSnapshots, type Platform } from '@/lib/db';
import type { ProviderAdapter, PostMetrics, RemoteComment } from './types';
import { demoContent } from '@/lib/db/demo-content';

/** Demo provider: lets the whole app run without real API keys (DEMO_MODE=1). */

const DAILY_GROWTH: Record<Platform, [number, number]> = {
  telegram: [10, 60],
  instagram: [0, 20],
  threads: [20, 110],
  x: [0, 1],
  linkedin: [2, 15],
};


const rnd = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function mockAdapter(platform: Platform): ProviderAdapter {
  return {
    platform,
    async publish() {
      await new Promise((r) => setTimeout(r, 300));
      const id = `demo-${Date.now()}-${rnd(100, 999)}`;
      return { externalId: id };
    },
    async fetchStats(ctx) {
      const [last] = await db
        .select({ followers: metricSnapshots.followers })
        .from(metricSnapshots)
        .where(eq(metricSnapshots.accountId, ctx.account.id))
        .orderBy(desc(metricSnapshots.day))
        .limit(1);
      const [lo, hi] = DAILY_GROWTH[platform];
      // a sync runs hourly; add roughly 1/24 of the daily growth
      return { followers: (last?.followers ?? 0) + Math.round(rnd(lo, hi) / 24) };
    },
    async fetchPostMetrics(_ctx, ids) {
      const out: Record<string, PostMetrics> = {};
      for (const id of ids) out[id] = { views: rnd(200, 4000), reactions: rnd(5, 150), comments: rnd(0, 20), shares: rnd(0, 15) };
      return out;
    },
    async fetchComments(_ctx, ids) {
      if (ids.length === 0 || Math.random() > 0.3) return [];
      const postId = pick(ids);
      const comment: RemoteComment = {
        externalId: `demo-c-${Date.now()}`,
        postExternalId: postId,
        authorName: pick(demoContent().commenters),
        text: pick(demoContent().comments),
        postedAt: new Date(),
      };
      return [comment];
    },
    async reply() {},
    // demo accounts are seeded with history already
    async fetchPosts() {
      return [];
    },
  };
}
