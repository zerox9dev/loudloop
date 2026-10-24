'use server';

import { revalidatePath } from 'next/cache';
import { compare, hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { Api } from 'grammy';
import { TwitterApi } from 'twitter-api-v2';
import { z } from 'zod';
import { db, accounts, users } from '@/lib/db';
import { requireUser } from '@/lib/auth/user';
import { upsertConnectedAccount } from '@/lib/services/connect';
import { enqueueBackfill } from '@/lib/queue';
import { graphFetch, qs } from '@/lib/providers/http';
import { linkedinMe } from '@/lib/providers/linkedin';
import { getTranslations } from 'next-intl/server';
import { isLocale } from '@/i18n/config';
import { setLocaleCookie } from '@/lib/i18n/locale';
import { startLogin, submitCode, submitPassword } from '@/lib/services/telegram-login';

type State = { error?: string; ok?: string } | undefined;

/** Every connect form posts the project it was opened in. */
function projectIdOf(form: FormData) {
  const id = Number(form.get('projectId'));
  if (!Number.isInteger(id) || id <= 0) throw new Error('pickProject');
  return id;
}

const tr = () => getTranslations('account');
const fail = async (e: unknown): Promise<State> => {
  const msg = e instanceof Error ? e.message : String(e);
  return msg === 'pickProject' ? err('pickProject') : { error: msg };
};

async function err(key: string): Promise<State> {
  return { error: (await tr())(`errors.${key}` as 'errors.checkFields') };
}

function done(msg: string): State {
  revalidatePath('/', 'layout');
  return { ok: msg };
}

export async function connectTelegram(_prev: State, form: FormData): Promise<State> {
  await requireUser();
  const parsed = z
    .object({ botToken: z.string().trim().min(20), chatId: z.string().trim().min(2), session: z.string().trim().optional() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return err('telegramFields');
  const { botToken, session } = parsed.data;
  const chatId = /^-?\d+$/.test(parsed.data.chatId) || parsed.data.chatId.startsWith('@') ? parsed.data.chatId : `@${parsed.data.chatId}`;
  try {
    const api = new Api(botToken);
    const chat = await api.getChat(chatId);
    const me = await api.getMe();
    const member = await api.getChatMember(chatId, me.id);
    if (member.status !== 'administrator' && member.status !== 'creator') return err('botNotAdmin');
    const username = 'username' in chat && chat.username ? `@${chat.username}` : null;
    await upsertConnectedAccount({
      projectId: projectIdOf(form),
      platform: 'telegram',
      handle: username ?? ('title' in chat ? (chat.title ?? chatId) : chatId),
      displayName: 'title' in chat ? chat.title : null,
      externalId: String(chat.id),
      credentials: { botToken, chatId: username ?? String(chat.id), session: session || undefined },
    });
    return done((await tr())('ok.connected', { platform: 'Telegram' }));
  } catch (e) {
    return fail(e);
  }
}

export async function connectX(_prev: State, form: FormData): Promise<State> {
  await requireUser();
  const parsed = z.object({ accessToken: z.string().trim().min(10), accessSecret: z.string().trim().min(10) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return err('xFields');
  if (!process.env.X_API_KEY || !process.env.X_API_SECRET) return err('xKeys');
  try {
    const client = new TwitterApi({ appKey: process.env.X_API_KEY, appSecret: process.env.X_API_SECRET, ...parsed.data });
    const { data } = await client.v2.me();
    await upsertConnectedAccount({
      projectId: projectIdOf(form),
      platform: 'x',
      handle: `@${data.username}`,
      displayName: data.name,
      externalId: data.id,
      credentials: { ...parsed.data, userId: data.id, username: data.username },
    });
    return done((await tr())('ok.connected', { platform: 'X' }));
  } catch (e) {
    return fail(e);
  }
}

/** Manual token path for Instagram / Threads (e.g. a long-lived token from Meta's token tool). */
export async function connectMetaToken(_prev: State, form: FormData): Promise<State> {
  await requireUser();
  const parsed = z.object({ platform: z.enum(['instagram', 'threads']), accessToken: z.string().trim().min(20) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return err('tokenRequired');
  const { platform, accessToken } = parsed.data;
  try {
    const base = platform === 'instagram' ? 'https://graph.instagram.com/v23.0' : 'https://graph.threads.net/v1.0';
    const fields = platform === 'instagram' ? 'user_id,username' : 'id,username';
    const me = await graphFetch<{ id: string; user_id?: string; username: string }>(`${base}/me?${qs({ fields, access_token: accessToken })}`);
    const userId = String(me.user_id ?? me.id);
    await upsertConnectedAccount({
      projectId: projectIdOf(form),
      platform,
      handle: `@${me.username}`,
      externalId: userId,
      credentials: { accessToken, userId },
      expiresAt: new Date(Date.now() + 55 * 86400_000),
    });
    return done((await tr())('ok.connected', { platform: platform === 'instagram' ? 'Instagram' : 'Threads' }));
  } catch (e) {
    return fail(e);
  }
}

export async function connectLinkedinToken(_prev: State, form: FormData): Promise<State> {
  await requireUser();
  const parsed = z.object({ accessToken: z.string().trim().min(20) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return err('tokenRequired');
  try {
    const me = await linkedinMe(parsed.data.accessToken);
    await upsertConnectedAccount({
      projectId: projectIdOf(form),
      platform: 'linkedin',
      handle: me.name,
      externalId: me.sub,
      credentials: { accessToken: parsed.data.accessToken, personUrn: me.urn },
      expiresAt: new Date(Date.now() + 55 * 86400_000),
    });
    return done((await tr())('ok.connected', { platform: 'LinkedIn' }));
  } catch (e) {
    return fail(e);
  }
}

/** Re-run the backfill of already published posts (e.g. after adding a Telegram MTProto session). */
export async function importHistory(id: number) {
  await requireUser();
  await db.update(accounts).set({ historyImportedAt: null, historyError: null }).where(eq(accounts.id, id));
  await enqueueBackfill(id);
  revalidatePath('/', 'layout');
}

export async function disconnectAccount(id: number) {
  await requireUser();
  await db.update(accounts).set({ status: 'disconnected', credentials: null }).where(eq(accounts.id, id));
  revalidatePath('/', 'layout');
}

export async function deleteAccount(id: number) {
  await requireUser();
  await db.delete(accounts).where(eq(accounts.id, id));
  revalidatePath('/', 'layout');
}

export async function removeDemoAccounts() {
  await requireUser();
  await db.delete(accounts).where(eq(accounts.status, 'demo'));
  revalidatePath('/', 'layout');
}

export async function updateProfile(_prev: State, form: FormData): Promise<State> {
  const user = await requireUser();
  const parsed = z
    .object({ name: z.string().trim().min(1).max(120), locale: z.string().optional(), current: z.string().optional(), next: z.string().optional() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return err('checkFields');
  const { name, current, next, locale } = parsed.data;
  const patch: Partial<typeof users.$inferInsert> = { name, ...(isLocale(locale) ? { locale } : {}) };
  if (next) {
    if (next.length < 8) return err('passwordShort');
    if (!current || !(await compare(current, user.passwordHash))) return err('passwordWrong');
    patch.passwordHash = await hash(next, 10);
  }
  await db.update(users).set(patch).where(eq(users.id, user.id));
  if (isLocale(locale)) await setLocaleCookie(locale);
  return done((await tr())('ok.saved'));
}

// ---------- Telegram account sign-in (phone → code → 2FA) ----------

export async function telegramLoginStart(accountId: number, phone: string): Promise<{ token?: string; error?: string }> {
  await requireUser();
  if (!/^\+?\d{7,15}$/.test(phone.replace(/[\s()-]/g, ''))) return { error: (await tr())('errors.phone') };
  try {
    return { token: await startLogin(accountId, phone.replace(/[\s()-]/g, '')) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function telegramLoginCode(token: string, code: string): Promise<{ step?: 'done' | 'password'; error?: string }> {
  await requireUser();
  try {
    const step = await submitCode(token, code);
    if (step === 'done') revalidatePath('/', 'layout');
    return { step };
  } catch (e) {
    const m = (e as { errorMessage?: string; message?: string }).errorMessage ?? (e as Error).message;
    const t = await tr();
    if (m === 'expired' || m === 'PHONE_CODE_EXPIRED') return { error: t('errors.codeExpired') };
    if (m === 'PHONE_CODE_INVALID') return { error: t('errors.codeWrong') };
    return { error: m };
  }
}

export async function telegramLoginPassword(token: string, password: string): Promise<{ step?: 'done'; error?: string }> {
  await requireUser();
  try {
    await submitPassword(token, password);
    revalidatePath('/', 'layout');
    return { step: 'done' };
  } catch (e) {
    const m = (e as { errorMessage?: string; message?: string }).errorMessage ?? (e as Error).message;
    const t = await tr();
    if (m === 'expired') return { error: t('errors.codeExpired') };
    if (m === 'PASSWORD_HASH_INVALID') return { error: t('errors.passwordWrongTg') };
    return { error: m };
  }
}
