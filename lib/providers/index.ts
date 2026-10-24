import { eq } from 'drizzle-orm';
import { db, accounts, type Account, type Platform } from '@/lib/db';
import { decryptJson, encryptJson } from '@/lib/crypto';
import type { ProviderAdapter, ProviderContext } from './types';
import { ProviderError } from './types';
import { redis } from '@/lib/queue';
import { telegramAdapter } from './telegram';
import { instagramAdapter } from './instagram';
import { threadsAdapter } from './threads';
import { xAdapter } from './x';
import { linkedinAdapter } from './linkedin';
import { mockAdapter } from './mock';

const REAL: Record<Platform, ProviderAdapter<never>> = {
  telegram: telegramAdapter as unknown as ProviderAdapter<never>,
  instagram: instagramAdapter as unknown as ProviderAdapter<never>,
  threads: threadsAdapter as unknown as ProviderAdapter<never>,
  x: xAdapter as unknown as ProviderAdapter<never>,
  linkedin: linkedinAdapter as unknown as ProviderAdapter<never>,
};

export function getAdapter(account: Account): ProviderAdapter {
  if (account.status === 'demo') return mockAdapter(account.platform);
  return REAL[account.platform] as unknown as ProviderAdapter;
}

export function buildContext(account: Account): ProviderContext {
  const credentials = account.status === 'demo' ? {} : (decryptJson<Record<string, unknown>>(account.credentials) ?? {});
  return {
    account,
    credentials,
    async saveCredentials(next, expiresAt) {
      await db
        .update(accounts)
        .set({ credentials: encryptJson(next), ...(expiresAt !== undefined ? { tokenExpiresAt: expiresAt } : {}) })
        .where(eq(accounts.id, account.id));
      Object.assign(credentials, next);
    },
  };
}

/**
 * Context with fresh credentials, for every caller (publish, sync, importer, replies).
 * Token refresh is serialized per account with a Redis lock: refresh tokens are single-use
 * (X rotates them), so two jobs must never refresh with the same one. A job that waits for the
 * lock re-reads the account and uses whatever the other job saved.
 */
export async function prepareContext(account: Account): Promise<ProviderContext> {
  const adapter = getAdapter(account);
  if (!adapter.refresh || account.status === 'demo') return buildContext(account);
  const key = `lock:refresh:${account.id}`;
  for (let attempt = 0; attempt < 30; attempt++) {
    const got = await redis().set(key, '1', 'EX', 60, 'NX');
    if (got) {
      try {
        const [fresh] = await db.select().from(accounts).where(eq(accounts.id, account.id));
        const ctx = buildContext(fresh ?? account);
        await adapter.refresh(ctx);
        return ctx;
      } finally {
        await redis().del(key);
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new ProviderError('Token refresh is busy, will retry');
}

export function isActive(account: Account) {
  return account.status === 'connected' || account.status === 'demo';
}

export * from './types';
