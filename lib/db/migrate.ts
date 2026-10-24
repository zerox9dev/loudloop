import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';

async function main() {
  // fail fast on boot instead of on the first login
  const secret = process.env.AUTH_SECRET ?? '';
  if (secret.length < 32 || secret.startsWith('change-me')) throw new Error('AUTH_SECRET is missing or weak: openssl rand -base64 32');
  if (Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64').length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes base64: openssl rand -base64 32');
  const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  const folder = process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), 'lib/db/migrations');
  await migrate(drizzle(client), { migrationsFolder: folder });
  await client.end();
  console.log('migrations applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
