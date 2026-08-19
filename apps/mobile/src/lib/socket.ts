import { Socket } from 'phoenix';

import { getVolunteerToken } from '@/lib/token';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const SOCKET_URL = API_URL.replace(/^http/, 'ws') + '/socket';

let socketPromise: Promise<Socket> | null = null;
// Bumped by resetSocket() so a getSocket() call already waiting on the
// (async) SecureStore token read can tell, once that read finishes, that
// it's now stale — without this, a reset that lands mid-read still lets
// the old attempt construct and connect() a Socket with the invalidated
// token that nothing holds a reference to and nothing will ever
// disconnect: an orphaned, endlessly-retrying connection.
let generation = 0;

// One socket for the app session, connected lazily on first channel join —
// mirrors apps/ui's src/lib/socket.ts (same backend, same UserSocket dual
// auth), just reading the volunteer token from SecureStore instead of a
// Clerk session. `transport: WebSocket` is passed explicitly rather than
// left to phoenix's own `global.WebSocket` fallback, since that's the one
// thing that actually differs from the browser: React Native's WebSocket
// is a true global (like fetch), not something living on `window`.
//
// Caches the in-flight *promise*, not the resolved Socket — two callers
// racing getSocket() before the first resolves would otherwise each
// construct their own Socket, silently orphaning the first connection.
// See resetSocket() below for why a cached socket can't just live forever.
export async function getSocket(): Promise<Socket> {
  if (!socketPromise) {
    const myGeneration = generation;
    socketPromise = getVolunteerToken()
      .then((token) => {
        if (myGeneration !== generation) {
          throw new Error('socket generation superseded by resetSocket()');
        }
        if (!token) {
          throw new Error('no volunteer token available');
        }
        const socket = new Socket(SOCKET_URL, { params: { token }, transport: WebSocket });
        socket.connect();
        return socket;
      })
      .catch((error) => {
        // Let the next caller try again instead of caching a rejected
        // promise forever — but only if nothing has reset in the
        // meantime (a reset already cleared socketPromise itself).
        if (myGeneration === generation) socketPromise = null;
        throw error;
      });
  }

  return socketPromise;
}

// Tears down the current socket (if any) and clears the cache, so the next
// getSocket() call re-fetches a fresh token and reconnects from scratch.
// Without this, a volunteer removed mid-session (token cleared, screenState
// -> 'expired') who then joins a *different* search in the same app
// session would find getSocket() still returning the socket built with the
// old, now-invalid token — every channel join silently rejected for the
// rest of the process. Call this anywhere clearVolunteerToken() is called.
export function resetSocket(): void {
  generation += 1;
  socketPromise
    ?.then((socket) => socket.disconnect())
    .catch(() => {});
  socketPromise = null;
}
