'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, goals, shareLinks } from '@/lib/db';
import { requireUser } from '@/lib/auth/user';
import { enqueueSyncAll } from '@/lib/queue';
import { monthKey } from '@/lib/dates';

export async function refreshAll() {
  await requireUser();
  await enqueueSyncAll();
  return { ok: true };
}

/** projectId null = a read-only link to the cross-project overview. */
export async function createShareLink(projectId: number | null) {
  await requireUser();
  const token = randomBytes(18).toString('base64url');
  await db.insert(shareLinks).values({ token, projectId });
  return { url: `${process.env.APP_URL ?? ''}/share/${token}` };
}

const goalsSchema = z.array(z.object({ accountId: z.number().int(), target: z.number().int().min(0).nullable() }));

export async function saveGoals(input: z.infer<typeof goalsSchema>) {
  await requireUser();
  const month = monthKey();
  for (const g of goalsSchema.parse(input)) {
    if (g.target === null || g.target === 0) {
      await db.delete(goals).where(and(eq(goals.accountId, g.accountId), eq(goals.month, month)));
    } else {
      await db
        .insert(goals)
        .values({ accountId: g.accountId, month, target: g.target })
        .onConflictDoUpdate({ target: [goals.accountId, goals.month], set: { target: g.target } });
    }
  }
  revalidatePath('/', 'layout');
}
