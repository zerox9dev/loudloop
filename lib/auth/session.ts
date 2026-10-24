import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

function key() {
  const secret = process.env.AUTH_SECRET ?? '';
  if (secret.length < 32 || secret.startsWith('change-me')) throw new Error('AUTH_SECRET is missing or weak: openssl rand -base64 32');
  return new TextEncoder().encode(secret);
}
const TTL_DAYS = 30;

type SessionData = { user: { id: number }; expires: string };

export async function signToken(payload: SessionData) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${TTL_DAYS}d`).sign(key());
}

export async function verifyToken(input: string) {
  const { payload } = await jwtVerify(input, key(), { algorithms: ['HS256'] });
  return payload as SessionData;
}

export async function getSession() {
  const session = (await cookies()).get('session')?.value;
  if (!session) return null;
  return verifyToken(session).catch(() => null);
}

export const cookieSecure = () => process.env.COOKIE_SECURE === 'true';

export async function setSession(userId: number) {
  const expires = new Date(Date.now() + TTL_DAYS * 86400_000);
  const token = await signToken({ user: { id: userId }, expires: expires.toISOString() });
  (await cookies()).set('session', token, { expires, httpOnly: true, secure: cookieSecure(), sameSite: 'lax', path: '/' });
}

export async function clearSession() {
  (await cookies()).delete('session');
}
