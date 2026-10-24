import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql, appKeys } from '@/lib/db';
import { appKeysOverview, clearAppKeys, getAppKeys, saveAppKeys } from '@/lib/services/app-keys';

const dbUp = await sql`select 1`.then(() => true, () => false);

describe.skipIf(!dbUp)('app keys (integration)', () => {
  // the test owns the x row: keep whatever a developer saved locally
  let saved: (typeof appKeys.$inferSelect)[] = [];
  const env = { id: process.env.X_CLIENT_ID, secret: process.env.X_CLIENT_SECRET };
  beforeAll(async () => {
    saved = await db.select().from(appKeys).where(eq(appKeys.platform, 'x'));
    await clearAppKeys('x');
  });
  afterAll(async () => {
    await clearAppKeys('x');
    if (saved.length) await db.insert(appKeys).values(saved);
    // assigning undefined would store the string "undefined"
    for (const [name, value] of [['X_CLIENT_ID', env.id], ['X_CLIENT_SECRET', env.secret]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await sql.end();
  });

  it('falls back to env, prefers saved keys, keeps the secret encrypted, and returns to env when cleared', async () => {
    process.env.X_CLIENT_ID = 'env-id';
    process.env.X_CLIENT_SECRET = 'env-secret';
    expect(await getAppKeys('x')).toEqual({ clientId: 'env-id', secret: 'env-secret', source: 'env' });

    await saveAppKeys('x', 'db-id', 'db-secret');
    expect(await getAppKeys('x')).toEqual({ clientId: 'db-id', secret: 'db-secret', source: 'db' });
    const [row] = await db.select().from(appKeys).where(eq(appKeys.platform, 'x'));
    expect(row.secret).not.toContain('db-secret');

    await saveAppKeys('x', 'db-id-2', 'db-secret-2');
    expect(await getAppKeys('x')).toMatchObject({ clientId: 'db-id-2', secret: 'db-secret-2' });

    await clearAppKeys('x');
    expect(await getAppKeys('x')).toMatchObject({ clientId: 'env-id', source: 'env' });

    delete process.env.X_CLIENT_ID;
    expect(await getAppKeys('x')).toBeNull();
  });

  it('an undecryptable row falls back to env instead of throwing', async () => {
    process.env.X_CLIENT_ID = 'env-id';
    await db.insert(appKeys).values({ platform: 'x', clientId: 'db-id', secret: 'not.a.cipher' });
    expect(await getAppKeys('x')).toMatchObject({ clientId: 'env-id', source: 'env' });
    expect((await appKeysOverview(['x'])).x).toMatchObject({ source: 'env' });
    await clearAppKeys('x');
  });
});
