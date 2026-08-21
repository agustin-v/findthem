import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

// Split from offline-cache.ts (the public read/write API) the same way
// socket.ts is its own module — this owns the encrypted database's
// lifecycle only (open, key, migrate, close+delete), nothing about what's
// actually stored in it.

const DB_NAME = 'findthem-offline.db';
const DB_KEY_STORAGE_KEY = 'findthem_offline_db_key';
const SCHEMA_VERSION = 2;

// Caches the in-flight open *promise*, not the resolved database — mirrors
// socket.ts's own reasoning: without this, two callers racing getDb() on a
// cold start could each open a separate native connection before either
// caches its result.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Bumped by resetOfflineDb() so an open already in flight when a reset
// lands can tell, once it resolves, that it's now stale — mirrors
// socket.ts's own `generation` counter exactly, for the same reason: without
// this, resetOfflineDb() nulling `dbPromise` while an old open is still
// resolving would let that old open silently repopulate `dbPromise` with a
// connection to a database file that's about to be (or already was)
// deleted out from under it — a real data-loss race, not just a cosmetic
// one, since a write against that orphaned connection would appear to
// succeed while never landing anywhere a future getDb() call can find it.
let generation = 0;

// SQLCipher key: a random secret generated once and stored in SecureStore,
// same shape as token.ts's own precedent (one small secret in the
// Keychain/Keystore protecting a larger body of data) — this is the app's
// first cache of *other people's* sensitive data (subject PII, other
// volunteers' remarks), not just its own bookkeeping, so it gets the same
// protection rather than sitting on disk in plaintext.
async function getOrCreateEncryptionKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DB_KEY_STORAGE_KEY);
  if (existing) return existing;

  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  await SecureStore.setItemAsync(DB_KEY_STORAGE_KEY, key);
  return key;
}

// PRAGMA key is a silent no-op on a build where the expo-sqlite config
// plugin's useSQLCipher: true didn't actually take effect (e.g. a
// dev-client build predating that config) — vanilla SQLite doesn't error on
// an unrecognized PRAGMA, it just ignores it, so the database would open
// and work normally while writing every row in plaintext with nothing ever
// noticing. PRAGMA cipher_version only returns a real value on an actual
// SQLCipher build; verifying it here turns a silent, undetectable
// fail-open into a loud, immediate one — this cache is not worth having if
// it can't confirm the one property it exists for.
async function assertCipherActive(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ cipher_version: string | null }>('PRAGMA cipher_version');
  if (!row?.cipher_version) {
    throw new Error(
      'SQLCipher is not active on this build — refusing to use the offline cache unencrypted.',
    );
  }
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  // Each step only runs for a device below that version, so an app update
  // never re-runs a step a device already applied — this is exactly the
  // infrastructure Story #53 set up this ladder for.
  if (version < 1) {
    // `data` holds the cached JSON blob directly, as a SQLCipher-encrypted
    // column — NOT a path to a plain file on disk. A separate
    // expo-file-system file was the original design, but that would leave
    // the actual sensitive payload (subject PII, remarks) sitting in
    // plaintext next to an encrypted database that protects nothing but
    // its own metadata about that file — caught by adversarial review
    // before this shipped. SQLite handles a multi-MB TEXT column fine, and
    // a single INSERT/UPDATE is already atomic (SQLite's own crash
    // safety), so the temp-write-then-rename dance a real file would have
    // needed isn't necessary here either.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        search_id TEXT,
        cached_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
    `);
  }

  if (version < 2) {
    // Story #54's outbox — key is the coalescing dimension (see
    // outbox-policy.ts's own comment: mark_segment:<segment_id> for
    // status actions, the action's own id for remark/message, which never
    // coalesce), separate from id (the row's own identity) so a coalesced
    // replacement can carry a fresh id/created_at while still being found
    // and superseded by key. payload is the actual action content, stored
    // as JSON — same "inside the encrypted column, never a separate file"
    // reasoning as cache_entries above.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS outbox_actions (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        failure_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS outbox_actions_key ON outbox_actions (key);
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

// Not exposed as an open option — expo-sqlite's SQLiteOpenOptions has no
// key/cipher field at all; SQLCipher is enabled at the native-build level
// via the expo-sqlite config plugin (app.json's useSQLCipher: true) and the
// key itself is applied as a PRAGMA immediately after opening, before any
// other statement touches the file.
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    const myGeneration = generation;
    dbPromise = (async () => {
      const key = await getOrCreateEncryptionKey();
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      if (myGeneration !== generation) {
        // A reset landed while this open was in flight — this connection
        // is for a database file that may already be gone. Close it and
        // let the caller's own catch below re-null dbPromise (only if
        // nothing has reset *again* since) so the next call opens fresh
        // against the current generation instead of silently adopting
        // this orphaned one.
        await db.closeAsync().catch(() => {});
        throw new Error('offline db generation superseded by resetOfflineDb()');
      }
      await db.execAsync(`PRAGMA key = '${key}';`);
      await assertCipherActive(db);
      await migrate(db);
      return db;
    })().catch((error) => {
      // Let the next caller try again instead of caching a rejected
      // promise forever — but only if nothing has reset in the meantime (a
      // reset already cleared dbPromise itself). Without this, a single
      // transient open failure (locked file, momentary disk pressure) would
      // silently disable the offline cache for the rest of the process,
      // since `if (!dbPromise)` is false for a promise regardless of
      // whether it's settled or how.
      if (myGeneration === generation) dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

// Closes and deletes the underlying file outright rather than trying to
// DELETE FROM every table — simpler, and a stronger guarantee: there is no
// way for a future table this module doesn't know about (e.g. Story #54's
// outbox) to survive a reset by omission.
export async function resetOfflineDb(): Promise<void> {
  generation += 1;
  const pending = dbPromise;
  dbPromise = null;
  if (pending) {
    await pending
      .then((db) => db.closeAsync())
      .catch(() => {
        // Already closed, never successfully opened, or a corrupt file —
        // any of these still means there's nothing more to close; deleting
        // the file below is what actually matters for the reset.
      });
  }
  await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => {
    // No database file ever existed (fresh install, or a previous reset
    // already removed it) — not an error.
  });
}
