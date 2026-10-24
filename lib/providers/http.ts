import { ProviderError } from './types';

/** Small JSON fetch wrapper for Graph-style APIs: throws ProviderError with API message. */
export async function graphFetch<T>(url: string, init?: RequestInit & { form?: Record<string, string> }): Promise<T> {
  const { form, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    ...(form ? { method: rest.method ?? 'POST', body: new URLSearchParams(form) } : {}),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!res.ok || body.error) {
    const msg = body.error?.message ?? `HTTP ${res.status}`;
    // 4xx except rate limiting are not worth retrying
    const retryable = res.status >= 500 || res.status === 429 || body.error?.code === 4 || body.error?.code === 17;
    throw new ProviderError(msg, retryable);
  }
  return body;
}

export function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) sp.set(k, String(v));
  return sp.toString();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Per-item fetches (one call per post) may fail individually, e.g. for deleted media.
 * If every call failed (and there was more than one), surface the error so sync records it instead of silently returning nothing.
 */
export async function perItem<T>(ids: string[], fn: (id: string) => Promise<T>): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  let failed = false;
  let firstError: unknown;
  for (const id of ids) {
    try {
      out.set(id, await fn(id));
    } catch (e) {
      if (!failed) firstError = e;
      failed = true;
    }
  }
  // a single failing item is usually deleted media, not a broken account
  if (failed && out.size === 0 && ids.length > 1) throw firstError ?? new Error('all requests failed');
  return out;
}
