import type { signals } from '@/lib/db/schema';

type Signal = Pick<typeof signals.$inferSelect, 'kind' | 'title' | 'body' | 'params'>;
type Translate = ((key: string, values?: Record<string, string | number>) => string) & { has?: (key: string) => boolean };

/**
 * Localized title/body for a signal. New signals store their kind + params; `variant` picks a
 * sub-message (e.g. publish_partial). Rows from before localization fall back to stored text.
 */
export function signalText(s: Signal, t: Translate) {
  if (!s.params) return { title: s.title, body: s.body };
  const key = `signal.${s.params.variant ?? s.kind}`;
  const values = s.params as Record<string, string | number>;
  const body = t.has?.(`${key}.body`) ? t(`${key}.body`, values) : (s.params.text as string | undefined) ?? s.body;
  return { title: t(`${key}.title`, values), body };
}
