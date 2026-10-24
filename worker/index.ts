import { Worker, type Job } from 'bullmq';
import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { QUEUE, queue, redis } from '@/lib/queue';
import { publishPost } from '@/lib/services/publish';
import { ensureInsights, syncAll } from '@/lib/services/sync';
import { backfillAccount } from '@/lib/services/importer';
import { fetchAllSources } from '@/lib/services/sources';
import { reconcileScheduled } from '@/lib/services/reconcile';
import { autoFill } from '@/lib/services/factory';
import { ensureBucket, s3Enabled } from '@/lib/storage';

const connection = redis();

const publishWorker = new Worker(
  QUEUE.publish,
  async (job: Job<{ postId: number }>) => {
    const res = await publishPost(job.data.postId);
    // Retry only transient failures; targets already published are skipped on retry.
    if (res.retry) throw new Error(`publish ${job.data.postId}: ${res.status}, retrying`);
    return res;
  },
  { connection, concurrency: 3 },
);

const syncWorker = new Worker(
  QUEUE.sync,
  async (job: Job<{ accountId?: number }>) => {
    if (job.name === 'backfill' && job.data.accountId) return backfillAccount(job.data.accountId);
    await syncAll();
  },
  { connection, concurrency: 1 },
);

const maintenanceWorker = new Worker(
  QUEUE.maintenance,
  async (job) => {
    if (job.name === 'sources') {
      await fetchAllSources();
      await autoFill(); // new ideas may refill empty pipelines
    }
    if (job.name === 'autofill') await autoFill();
    if (job.name === 'insights') await ensureInsights(true);
    if (job.name === 'reconcile') await reconcileScheduled();
  },
  { connection, concurrency: 1 },
);

for (const w of [publishWorker, syncWorker, maintenanceWorker]) {
  w.on('failed', (job, err) => console.error(`[${w.name}] job ${job?.id} failed: ${err.message}`));
  w.on('completed', (job) => console.log(`[${w.name}] job ${job.id} done`));
}

async function schedule() {
  await queue(QUEUE.sync).upsertJobScheduler('hourly-sync', { pattern: '5 * * * *' }, { name: 'sync-all' });
  await queue(QUEUE.maintenance).upsertJobScheduler('sources', { every: 2 * 60 * 60 * 1000 }, { name: 'sources' });
  await queue(QUEUE.maintenance).upsertJobScheduler('insights', { pattern: '0 8 * * *' }, { name: 'insights' });
  await queue(QUEUE.maintenance).upsertJobScheduler('autofill', { pattern: '30 7 * * *' }, { name: 'autofill' });
  await queue(QUEUE.maintenance).upsertJobScheduler('reconcile', { every: 10 * 60 * 1000 }, { name: 'reconcile' });
  // run once at boot so a fresh install has data
  await queue(QUEUE.sync).add('sync-all', {}, { jobId: `boot-${Date.now()}` });
  await queue(QUEUE.maintenance).add('reconcile', {});
  await queue(QUEUE.maintenance).add('sources', {});
}

const app = express();
const board = new ExpressAdapter();
board.setBasePath('/queues');
createBullBoard({ queues: Object.values(QUEUE).map((n) => new BullMQAdapter(queue(n))), serverAdapter: board });
app.use('/queues', board.getRouter());
app.get('/health', (_req, res) => {
  res.json({ ok: connection.status === 'ready' });
});

const port = Number(process.env.WORKER_PORT ?? 3001);
app.listen(port, () => console.log(`worker up, bull-board on :${port}/queues`));
schedule().catch((e) => console.error('scheduler setup failed', e));
if (s3Enabled()) ensureBucket().then(() => console.log(`s3 bucket ${process.env.S3_BUCKET} ready`), (e) => console.error('s3 bucket setup failed', e));

async function shutdown() {
  await Promise.all([publishWorker.close(), syncWorker.close(), maintenanceWorker.close()]);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
