import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, accounts } from '@/lib/db';
import { decryptJson, encryptJson } from '@/lib/crypto';
import { enqueueBackfill, redis } from '@/lib/queue';
import type { TelegramCredentials } from '@/lib/providers/telegram';

/**
 * In-app Telegram account sign-in (phone → code → optional 2FA password) that yields the MTProto
 * session the channel needs for views, reactions, comments and history. The half-finished
 * session lives encrypted in Redis for 10 minutes between steps.
 */
type Pending = { accountId: number; phone: string; phoneCodeHash: string; session: string };

const KEY = (token: string) => `tglogin:${token}`;
const TTL = 600;

function apiCredentials() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH ?? '';
  if (!apiId || !apiHash) throw new Error('TELEGRAM_API_ID / TELEGRAM_API_HASH are not set');
  return { apiId, apiHash };
}

export const telegramLoginReady = () => !!(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH);

async function connect(session = '') {
  const { TelegramClient } = await import('telegram');
  const { StringSession } = await import('telegram/sessions');
  const { apiId, apiHash } = apiCredentials();
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 3 });
  client.setLogLevel('error' as never);
  await client.connect();
  return client;
}

async function load(token: string) {
  const raw = await redis().get(KEY(token));
  const pending = raw ? decryptJson<Pending>(raw) : null;
  if (!pending) throw new Error('expired');
  return pending;
}

/** Step 1: Telegram sends a login code to the user's app (or SMS). */
export async function startLogin(accountId: number, phone: string) {
  const [acc] = await db.select({ platform: accounts.platform }).from(accounts).where(eq(accounts.id, accountId));
  if (acc?.platform !== 'telegram') throw new Error('not a Telegram account');
  const client = await connect();
  try {
    const { phoneCodeHash } = await client.sendCode(apiCredentials(), phone);
    const token = randomBytes(16).toString('hex');
    const pending: Pending = { accountId, phone, phoneCodeHash, session: client.session.save() as unknown as string };
    await redis().set(KEY(token), encryptJson(pending), 'EX', TTL);
    return token;
  } finally {
    await client.disconnect();
  }
}

async function finish(token: string, pending: Pending, session: string) {
  const [acc] = await db.select().from(accounts).where(eq(accounts.id, pending.accountId));
  if (!acc || acc.platform !== 'telegram') throw new Error('not a Telegram account');
  const creds = decryptJson<TelegramCredentials>(acc.credentials);
  if (!creds) throw new Error('account has no bot credentials');
  await db
    .update(accounts)
    .set({ credentials: encryptJson({ ...creds, session }), historyImportedAt: null, historyError: null })
    .where(eq(accounts.id, acc.id));
  await redis().del(KEY(token));
  // with a session the channel's history, views and comments become available
  await enqueueBackfill(acc.id).catch(() => undefined);
}

/** Step 2: the code. Returns 'password' when the account has two-step verification. */
export async function submitCode(token: string, code: string): Promise<'done' | 'password'> {
  const pending = await load(token);
  const client = await connect(pending.session);
  try {
    const { Api } = await import('telegram');
    try {
      await client.invoke(new Api.auth.SignIn({ phoneNumber: pending.phone, phoneCodeHash: pending.phoneCodeHash, phoneCode: code.trim() }));
    } catch (e) {
      if ((e as { errorMessage?: string }).errorMessage === 'SESSION_PASSWORD_NEEDED') return 'password';
      throw e;
    }
    await finish(token, pending, client.session.save() as unknown as string);
    return 'done';
  } finally {
    await client.disconnect();
  }
}

/** Step 3 (only with 2FA): the cloud password, checked via SRP — it never leaves as plain text. */
export async function submitPassword(token: string, password: string) {
  const pending = await load(token);
  const client = await connect(pending.session);
  try {
    const { Api } = await import('telegram');
    const { computeCheck } = await import('telegram/Password');
    const srp = await client.invoke(new Api.account.GetPassword());
    await client.invoke(new Api.auth.CheckPassword({ password: await computeCheck(srp, password) }));
    await finish(token, pending, client.session.save() as unknown as string);
  } finally {
    await client.disconnect();
  }
}
