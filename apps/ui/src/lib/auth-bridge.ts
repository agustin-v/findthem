// Bridges Clerk's React-hook-only auth state into plain modules (router guards,
// the API client) that run outside the component tree. Kept in sync by
// ClerkAuthBridge, which mounts once inside <ClerkProvider>.

type TokenGetter = () => Promise<string | null>

let tokenGetter: TokenGetter | null = null
let signedIn = false

export function setAuthBridge(getToken: TokenGetter, isSignedIn: boolean) {
  tokenGetter = getToken
  signedIn = isSignedIn
}

export function isAuthenticated(): boolean {
  return signedIn
}

export async function getAuthToken(): Promise<string | null> {
  return tokenGetter ? tokenGetter() : null
}
