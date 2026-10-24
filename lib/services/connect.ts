import { and, eq } from 'drizzle-orm';
import { db, accounts, type Platform } from '@/lib/db';
import { encryptJson } from '@/lib/crypto';
import { enqueueBackfill, enqueueSyncAll } from '@/lib/queue';

/** Create or update a real (non-demo) account for a platform identity. */
export class AccountInAnotherProjectError extends Error {}

export async function upsertConnectedAccount(input: {
  projectId: number;
  platform: Platform;
  handle: string;
  displayName?: string | null;
  externalId: string;
  credentials: unknown;
  expiresAt?: Date | null;
}) {
  const values = {
    projectId: input.projectId,
    platform: input.platform,
    handle: input.handle,
    displayName: input.displayName ?? null,
    externalId: input.externalId,
    status: 'connected' as const,
    credentials: encryptJson(input.credentials),
    tokenExpiresAt: input.expiresAt ?? null,
    lastError: null,
  };
  const [existing] = await db
    .select({ id: accounts.id, projectId: accounts.projectId })
    .from(accounts)
    .where(and(eq(accounts.platform, input.platform), eq(accounts.externalId, input.externalId)));
  // one identity lives in one project; moving it is an explicit action, not a side effect of reconnecting
  if (existing && existing.projectId !== input.projectId) throw new AccountInAnotherProjectError('This account is already connected in another project');
  let id = existing?.id;
  if (id) await db.update(accounts).set(values).where(eq(accounts.id, id));
  else id = (await db.insert(accounts).values(values).returning({ id: accounts.id }))[0].id;
  // pull what's already published, then a regular sync for followers/metrics/comments
  await enqueueBackfill(id).catch(() => undefined);
  await enqueueSyncAll().catch(() => undefined);
}
