import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db, posts, projects } from '@/lib/db';
import { publishJobId, queue, QUEUE, schedulePost } from '@/lib/queue';

/** Safety net: every scheduled post must have a delayed job (e.g. after a Redis wipe). */
export async function reconcileScheduled() {
  const scheduled = await db
    .select({ id: posts.id, at: posts.scheduledAt })
    .from(posts)
    .innerJoin(projects, eq(projects.id, posts.projectId))
    .where(and(eq(posts.status, 'scheduled'), isNotNull(posts.scheduledAt), isNull(projects.archivedAt)));
  const q = queue(QUEUE.publish);
  for (const p of scheduled) {
    const job = await q.getJob(publishJobId(p.id));
    if (!job || (await job.isFailed()) || (await job.isCompleted())) await schedulePost(p.id, p.at);
  }
}
