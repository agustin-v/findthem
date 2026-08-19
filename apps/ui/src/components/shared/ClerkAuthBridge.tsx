import { useEffect, type ReactNode } from 'react'
import { useAuth } from '@clerk/react'
import { router } from '@/router'
import { setAuthBridge } from '@/lib/auth-bridge'
import { resetSocket } from '@/lib/socket'

// Wraps <RouterProvider> (not rendered inside it) so the auth bridge is
// populated synchronously during render, before the router's first
// beforeLoad match runs. A later useEffect re-syncs on sign-in/out and
// invalidates the router so guards re-evaluate immediately.
export function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken } = useAuth()

  setAuthBridge(() => getToken(), !!isSignedIn)

  useEffect(() => {
    router.invalidate()
    // The realtime socket caches whatever token was current on first
    // connect — without this, signing out (or switching accounts in the
    // same tab) leaves it holding a token for an identity that's no
    // longer active until a full page reload.
    resetSocket()
  }, [isSignedIn])

  return children
}
