import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

import { getDb, resetOfflineDb } from '@/lib/offline-db';
import { isCacheStale } from '@/lib/offline-cache-policy';
import type { VolunteerSearchData } from '@/lib/api';

// Same dev-only guard token.ts already uses, for the same reason: this app
// has no real web target (map.tsx can't even render there —
// @maplibre/maplibre-react-native has no web backing at all), so a
// production web build is not a supported deployment of this cache. Unlike
// token.ts there is no localStorage fallback implemented here at all —
// expo-sqlite has no meaningful web module to fall back to in the first
// place, so web simply never caches (every call below is a clean
// no-op/cache-miss), which is inherently safe (nothing stored, so nothing
// to leak) rather than a security exception that needs guarding against
// being reached. The assertion still guards the one thing that *would* be
// wrong: silently pretending to cache on web forever without anyone
// noticing it never works.
function assertWebDevOnly() {
  if (!__DEV__) {
    throw new Error('Web is not a supported target for the offline cache.');
  }
}

// The cache key is a SHA-256 hex digest of the volunteer's own auth token,
// not a literal volunteer_id + search_id pair — deliberately, not a
// shortcut. Neither id is available client-side without an extra network
// round trip (VolunteerSearchData carries the *search's* id but not the
// volunteer's own; the volunteer's id only comes back from
// GET /volunteer/session), and the whole point of this cache is rendering
// something instantly, offline, with zero network calls. The token is
// already the one credential that uniquely and exclusively identifies
// "this volunteer, this search" — hashing it satisfies the same scoping
// guarantee the plan asked for (two different identities can never
// collide on a cache key) without needing data that isn't available yet.
// resetOfflineStore() below is still called at every identity-boundary
// site as the primary defense; this hashed key is what keeps a *missed*
// reset call from being a silent leak instead of just a clean cache miss.
async function cacheKey(token: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

interface CacheEntryRow {
  key: string;
  search_id: string | null;
  cached_at: number;
  data: string;
}

// Bumped whenever VolunteerSearchData's shape changes in a way an older
// cached blob wouldn't satisfy. A cached entry written under a different
// format version is treated as a miss rather than fed into application
// state — a 1-hour-old cache (well within CACHE_MAX_AGE_MS) written by a
// pre-update app version, read back after an OTA update changed this
// shape, would otherwise be handed straight to setSegments/setRemarks/etc.
// with no validation and could crash a later .map/.filter on a
// renamed/missing field.
const CACHE_FORMAT_VERSION = 1;

interface CacheEnvelope {
  v: number;
  data: VolunteerSearchData;
}

export interface CachedVolunteerSearch {
  data: VolunteerSearchData;
  cachedAt: number;
}

// Best-effort, like every other cache/local-storage read in this app
// (chat-read-state.ts's hydrate, useLocationReporting's ping failures) —
// a corrupt row, a version mismatch, or a native-module error all just
// mean "no cache", not a thrown error the caller has to handle. The point
// of a read cache is to make offline-first *more* resilient, not to add a
// new way for the app to crash.
export async function getCachedVolunteerSearch(token: string): Promise<CachedVolunteerSearch | null> {
  if (Platform.OS === 'web') {
    assertWebDevOnly();
    return null;
  }

  try {
    const key = await cacheKey(token);
    const db = await getDb();
    const row = await db.getFirstAsync<CacheEntryRow>(
      'SELECT * FROM cache_entries WHERE key = ?',
      key,
    );
    if (!row) return null;
    if (isCacheStale(row.cached_at, Date.now())) return null;

    const envelope = JSON.parse(row.data) as CacheEnvelope;
    if (envelope.v !== CACHE_FORMAT_VERSION) return null;

    return { data: envelope.data, cachedAt: row.cached_at };
  } catch {
    return null;
  }
}

// Cheap presigned-URL-only cache, never image bytes — VolunteerSearchData's
// search.photoUrls are already just the presigned URL strings (see
// GET /volunteer/search's own contract), so caching the response verbatim
// already satisfies "no bytes, no outliving the 1-hour access window"
// without any special-casing here. A stale cached URL past its hour simply
// fails to load, same as it would on a live, unrefreshed screen.
//
// Stored as a TEXT column inside the SQLCipher-encrypted database, not a
// separate plain file — see offline-db.ts's own migrate() comment for why
// (an earlier expo-file-system-based design left the actual PII payload
// unencrypted next to a database that only protected metadata about it,
// caught by adversarial review before this shipped).
export async function setCachedVolunteerSearch(
  token: string,
  data: VolunteerSearchData,
): Promise<void> {
  if (Platform.OS === 'web') {
    assertWebDevOnly();
    return;
  }

  try {
    const key = await cacheKey(token);
    const envelope: CacheEnvelope = { v: CACHE_FORMAT_VERSION, data };
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO cache_entries (key, search_id, cached_at, data)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET search_id = excluded.search_id,
         cached_at = excluded.cached_at, data = excluded.data`,
      key,
      data.search.id,
      Date.now(),
      JSON.stringify(envelope),
    );
  } catch {
    // Best-effort — a failed cache write must never surface as an error on
    // what is, from the volunteer's perspective, a successful live fetch.
  }
}

// Called from every existing identity-boundary site in this app — every
// clearVolunteerToken() call site, and join/[code].tsx *before*
// saveVolunteerToken (a new-identity write, not a clear) — so a second
// volunteer joining on a previously-used device never inherits the first
// volunteer's cached search, and so a coordinator's removal (which purges
// the stored token) also purges whatever that volunteer could otherwise
// still read from disk while offline. Deletes the whole database file, not
// just the current token's own row — a clean, total reset, not a
// per-identity delete that could leave an orphaned row behind from an
// identity nothing ever explicitly cleaned up.
//
// Always awaited by every call site (even the ones that don't strictly
// need the result) rather than fire-and-forget — this used to also delete
// a separate cache directory synchronously, but now that everything lives
// in the one SQLite file, the whole reset is a single async operation with
// nothing left to do synchronously; leaving it un-awaited would let the
// underlying close+delete still be in flight at the exact moment (a device
// changing hands) this feature exists to protect.
export async function resetOfflineStore(): Promise<void> {
  if (Platform.OS === 'web') {
    assertWebDevOnly();
    return;
  }

  await resetOfflineDb().catch((error) => {
    // Best-effort — a coordinator removing a volunteer, or a volunteer
    // joining fresh, must still proceed even if this cleanup step fails;
    // the alternative (throwing) would block sign-out/sign-in on a
    // cache-hygiene concern. Logged in dev so a real on-device failure
    // isn't completely invisible, unlike before this fix — a silently
    // swallowed reset failure left stale (though still SQLCipher-encrypted)
    // data behind with no record it happened.
    if (__DEV__) console.warn('resetOfflineStore failed', error);
  });
}
