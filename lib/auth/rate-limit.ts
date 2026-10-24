/**
 * Login throttling keyed on the account email (client-supplied IP headers can't be trusted
 * when the app is exposed directly). Wrong passwords add a growing delay instead of a hard
 * lockout, so an attacker can't lock the owner out, but brute force becomes impractically slow.
 */
const failures = new Map<string, { count: number; last: number }>();
const WINDOW = 15 * 60_000;
const MAX_KEYS = 1000;

export function loginDelayMs(key: string) {
  const f = failures.get(key);
  if (!f || Date.now() - f.last > WINDOW) return 0;
  return Math.min(250 * 2 ** f.count, 15_000);
}

export function recordFailure(key: string) {
  const now = Date.now();
  const f = failures.get(key);
  const count = f && now - f.last <= WINDOW ? f.count + 1 : 1;
  failures.delete(key);
  failures.set(key, { count, last: now });
  // Map keeps insertion order: drop the oldest entries to bound memory
  while (failures.size > MAX_KEYS) failures.delete(failures.keys().next().value!);
}

export function resetFailures(key: string) {
  failures.delete(key);
}
