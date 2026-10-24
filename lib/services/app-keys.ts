import { eq } from 'drizzle-orm';
import { db, appKeys } from '@/lib/db';
import { decryptJson, encryptJson } from '@/lib/crypto';

export type KeyedPlatform = 'instagram' | 'threads' | 'linkedin' | 'x';
export type AppKeys = { clientId: string; secret: string; source: 'db' | 'env' };

/** Env fallback, in the order [id, secret]. */
export const APP_KEYS_ENV: Record<KeyedPlatform, [string, string]> = {
  instagram: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
  threads: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  x: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
};

/** Keys saved in the dashboard win over env vars, so a redeploy without env doesn't break login. */
export async function getAppKeys(platform: KeyedPlatform): Promise<AppKeys | null> {
  const [row] = await db.select().from(appKeys).where(eq(appKeys.platform, platform));
  return resolve(platform, row);
}

function resolve(platform: KeyedPlatform, row?: typeof appKeys.$inferSelect): AppKeys | null {
  if (row) {
    try {
      return { clientId: row.clientId, secret: decryptJson<string>(row.secret) ?? '', source: 'db' };
    } catch (e) {
      // e.g. ENCRYPTION_KEY changed: fall back to env, saving new keys overwrites the row
      console.error(`app keys for ${platform} cannot be decrypted`, e);
    }
  }
  const [idVar, secretVar] = APP_KEYS_ENV[platform];
  const clientId = process.env[idVar];
  if (!clientId) return null;
  return { clientId, secret: process.env[secretVar] ?? '', source: 'env' };
}

export async function requireAppKeys(platform: KeyedPlatform): Promise<AppKeys> {
  const keys = await getAppKeys(platform);
  if (!keys) throw new Error(`${platform} app keys are not set`);
  return keys;
}

export async function saveAppKeys(platform: KeyedPlatform, clientId: string, secret: string) {
  const values = { platform, clientId, secret: encryptJson(secret), updatedAt: new Date() };
  await db.insert(appKeys).values(values).onConflictDoUpdate({ target: appKeys.platform, set: values });
}

export async function clearAppKeys(platform: KeyedPlatform) {
  await db.delete(appKeys).where(eq(appKeys.platform, platform));
}

/** What the dashboard may show: the id in full, only the tail of the secret. */
export async function appKeysOverview(platforms: KeyedPlatform[]) {
  const rows = await db.select().from(appKeys);
  const out = {} as Record<KeyedPlatform, { clientId: string; secretTail: string; source: AppKeys['source'] } | null>;
  for (const p of platforms) {
    const k = resolve(p, rows.find((r) => r.platform === p));
    out[p] = k && { clientId: k.clientId, secretTail: k.secret.slice(-4), source: k.source };
  }
  return out;
}
