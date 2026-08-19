import { readLastReadAt, writeLastReadAt } from '@/lib/chat-read-storage';

// Persisted (not just in-memory) — React Native tears down and rebuilds the
// JS context on an Android low-memory background kill or an iOS relaunch,
// which would otherwise silently reset this to null and report an entire
// multi-hour thread as unread the next time the volunteer opens the app.
let lastReadAt: string | null = null;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

// Await once, early (map.tsx's initial load effect), before the first
// getLastReadAt() call that actually matters for an unread computation —
// otherwise a cold start briefly reports "everything unread" while the
// persisted marker is still loading from disk. markReadUpTo() itself
// doesn't need this: it only ever moves the marker forward, which is
// correct regardless of whether hydration has completed yet.
export async function hydrateChatReadState(): Promise<void> {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = readLastReadAt()
      .then((stored) => {
        lastReadAt = stored;
      })
      .catch(() => {})
      .finally(() => {
        hydrated = true;
      });
  }
  return hydratePromise;
}

export function getLastReadAt(): string | null {
  return lastReadAt;
}

export function markReadUpTo(insertedAt: string): void {
  if (!lastReadAt || insertedAt > lastReadAt) {
    lastReadAt = insertedAt;
    // A real marker set this session is authoritative — a hydration read
    // that resolves afterwards (or hasn't been triggered yet) must not be
    // allowed to clobber it with a possibly-stale persisted value.
    hydrated = true;
    writeLastReadAt(lastReadAt).catch(() => {});
  }
}

// Called alongside resetSocket() wherever the volunteer's stored token is
// written or cleared — a new session (different volunteer, same device)
// must not inherit the previous volunteer's read marker.
export function resetChatReadState(): void {
  lastReadAt = null;
  hydrated = true;
  hydratePromise = null;
  writeLastReadAt(null).catch(() => {});
}
