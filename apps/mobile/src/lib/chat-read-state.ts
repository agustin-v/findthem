// In-memory (not persisted — matches this app's existing "no offline
// queueing" simplicity level, see CLAUDE.md) marker of the newest
// coordinator message the volunteer has actually seen, so map.tsx's chat
// entry point can show an unread badge without map.tsx and chat.tsx (two
// separate Expo Router screens with no shared component state) needing a
// prop/context bridge between them.
let lastReadAt: string | null = null;

export function getLastReadAt(): string | null {
  return lastReadAt;
}

export function markReadUpTo(insertedAt: string): void {
  if (!lastReadAt || insertedAt > lastReadAt) lastReadAt = insertedAt;
}

// Called alongside resetSocket() wherever the volunteer token is cleared —
// a new session (different volunteer, same device) must not inherit the
// previous volunteer's read marker.
export function resetChatReadState(): void {
  lastReadAt = null;
}
