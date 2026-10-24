'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { db, signals } from '@/lib/db';
import { requireUser } from '@/lib/auth/user';

export async function dismissSignal(id: number) {
  await requireUser();
  await db.update(signals).set({ dismissedAt: new Date() }).where(eq(signals.id, id));
  revalidatePath('/', 'layout');
}

export async function dismissAllSignals(projectId: number | null) {
  await requireUser();
  await db
    .update(signals)
    .set({ dismissedAt: new Date() })
    .where(and(isNull(signals.dismissedAt), projectId === null ? undefined : eq(signals.projectId, projectId)));
  revalidatePath('/', 'layout');
}
