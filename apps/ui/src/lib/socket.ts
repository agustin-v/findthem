import { Socket } from 'phoenix'
import { getAuthToken } from '@/lib/auth-bridge'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
const SOCKET_URL = API_URL.replace(/^http/, 'ws') + '/socket'

let socketPromise: Promise<Socket> | null = null

// One socket for the whole app, connected lazily on first channel join and
// left open across page navigation — reconnecting per search-detail visit
// would drop the "how long have we been live" signal a coordinator/volunteer
// implicitly relies on, and Phoenix's own client already backs off and
// retries on drop.
//
// Caches the in-flight *promise*, not the resolved Socket — two callers
// racing getSocket() before the first one resolves would otherwise each
// construct their own Socket (only the second write to `socket` would be
// findable by future callers, silently orphaning the first connection).
//
// The token is fetched once here rather than passed as Phoenix's supported
// params-as-function (re-invoked per reconnect attempt), because that
// function must be synchronous and Clerk's getToken() is not. That's fine
// for a *reconnect* after the original token's lifetime has passed — every
// piece of live-updated state here already has its REST+poll path as the
// source of truth (this channel is an enhancement layer, not a
// replacement), so a failed reconnect just means that data quietly falls
// back to polling instead of breaking. It's NOT fine for the very first
// connect: if that token is null/stale (e.g. a race with sign-in, or a
// sign-out/sign-in with a different account in the same tab), the module
// would otherwise cache a permanently-dead socket for the rest of the
// session with no way to recover. resetSocket() below exists for exactly
// that — ClerkAuthBridge calls it on every isSignedIn transition.
export async function getSocket(): Promise<Socket> {
  if (!socketPromise) {
    socketPromise = getAuthToken()
      .then((token) => {
        const socket = new Socket(SOCKET_URL, { params: { token } })
        socket.connect()
        return socket
      })
      .catch((error) => {
        // Let the next caller try again instead of caching a rejected promise forever.
        socketPromise = null
        throw error
      })
  }

  return socketPromise
}

// Tears down the current socket (if any) and clears the cache, so the next
// getSocket() call re-fetches a fresh token and reconnects from scratch.
export function resetSocket(): void {
  socketPromise?.then((socket) => socket.disconnect()).catch(() => {})
  socketPromise = null
}
