import { instagramOAuth } from './instagram';
import { threadsOAuth } from './threads';
import { linkedinOAuth } from './linkedin';
import { xOAuth } from './x';

/**
 * "Connect with …" providers. authorize() may return a PKCE verifier (X) that the start route
 * keeps in a short-lived httpOnly cookie for the callback.
 */
export const OAUTH = { instagram: instagramOAuth, threads: threadsOAuth, linkedin: linkedinOAuth, x: xOAuth } as const;
export type OAuthPlatform = keyof typeof OAUTH;

export const OAUTH_ENV: Record<OAuthPlatform, string[]> = {
  instagram: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
  threads: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  x: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
};

export function isOAuthPlatform(p: string): p is OAuthPlatform {
  return p in OAUTH;
}

export const callbackUrl = (p: OAuthPlatform) => `${process.env.APP_URL}/api/oauth/${p}/callback`;
