import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const QUEUE = { publish: 'publish', sync: 'sync', maintenance: 'maintenance' } as const;

const g = globalThis as unknown as { redis?: IORedis; queues?: Record<string, Queue> };

export function redis() {
  g.redis ??= new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6380', { maxRetriesPerRequest: null });
  return g.redis;
}

export function queue(name: (typeof QUEUE)[keyof typeof QUEUE]) {
  g.queues ??= {};
  g.queues[name] ??= new Queue(name, {
    connection: redis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  });
  return g.queues[name];
}

export const publishJobId = (postId: number) => `post-${postId}`;

/** (Re)schedule a post. Idempotent: one job per post, replaced on reschedule. */
export async function schedulePost(postId: number, at: Date | null) {
  const q = queue(QUEUE.publish);
  const existing = await q.getJob(publishJobId(postId));
  if (existing && !(await existing.isActive())) await existing.remove();
  const delay = at ? Math.max(at.getTime() - Date.now(), 0) : 0;
  await q.add('publish', { postId }, { jobId: publishJobId(postId), delay });
}

export async function unschedulePost(postId: number) {
  const job = await queue(QUEUE.publish).getJob(publishJobId(postId));
  if (job && !(await job.isActive())) await job.remove();
}

/** One backfill per account at a time (jobId dedupes repeated clicks / reconnects). */
export async function enqueueBackfill(accountId: number) {
  const q = queue(QUEUE.sync);
  const id = `backfill-${accountId}`;
  const existing = await q.getJob(id);
  if (existing && ((await existing.isCompleted()) || (await existing.isFailed()))) await existing.remove();
  await q.add('backfill', { accountId }, { jobId: id, attempts: 3 });
}

export async function enqueueSyncAll() {
  await queue(QUEUE.sync).add('sync-all', {}, { jobId: `sync-all-${Math.floor(Date.now() / 60_000)}` });
}
