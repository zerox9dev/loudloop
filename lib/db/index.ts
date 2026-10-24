import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

const client =
  globalForDb.pg ??
  postgres(process.env.DATABASE_URL ?? 'postgres://socialboard:socialboard@localhost:5433/socialboard', {
    max: 10,
    // SQL day bucketing must use the same zone as dayKey() in Node
    connection: { TimeZone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone },
  });
if (process.env.NODE_ENV !== 'production') globalForDb.pg = client;

export const db = drizzle(client, { schema });
export const sql = client;
export * from './schema';
