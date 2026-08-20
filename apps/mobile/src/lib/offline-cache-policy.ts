// Pure logic only — no react-native/expo-sqlite/expo-file-system imports —
// so this stays importable from vitest, same split as chat-read-state.ts/
// chat-read-storage.ts. The actual storage adapter (offline-cache.ts) is
// native-heavy and untested, matching that precedent.

// A SAR shift is measured in hours, not days — 24h is a defensible bound on
// how old a cached search/segment snapshot can be before it's more likely
// to mislead a volunteer than help one (a coordinator may have regenerated,
// resolved the search, or removed this volunteer since). This is also the
// backstop for VolunteerAuth's "removal takes effect immediately" guarantee
// while offline: the cache purges on every 401 (see offline-cache.ts), but
// a volunteer who never reconnects long enough to hit that path still has
// this hard ceiling.
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isCacheStale(cachedAt: number, now: number): boolean {
  return now - cachedAt > CACHE_MAX_AGE_MS;
}
