import { instagramOAuth } from './instagram';
import { threadsOAuth } from './threads';
import { linkedinOAuth } from './linkedin';
import { xOAuth } from './x';

/**
 * "Connect with …" providers, called with the app keys from getAppKeys(). authorize() may return
 * a PKCE verifier (X) that the start route keeps in a short-lived httpOnly cookie for the callback.
 */
export const OAUTH = { instagram: instagramOAuth, threads: threadsOAuth, linkedin: linkedinOAuth, x: xOAuth } as const;
export type OAuthPlatform = keyof typeof OAUTH;

/** App keys come from the dashboard (app_keys table) or, failing that, these env vars. */
export { APP_KEYS_ENV as OAUTH_ENV } from '@/lib/services/app-keys';

export function isOAuthPlatform(p: string): p is OAuthPlatform {
  return p in OAUTH;
}

export const callbackUrl = (p: OAuthPlatform) => `${process.env.APP_URL}/api/oauth/${p}/callback`;
