import { useEffect, type ReactNode } from 'react'
import { useAuth } from '@clerk/react'
import { router } from '@/router'
import { setAuthBridge } from '@/lib/auth-bridge'

// Wraps <RouterProvider> (not rendered inside it) so the auth bridge is
// populated synchronously during render, before the router's first
// beforeLoad match runs. A later useEffect re-syncs on sign-in/out and
// invalidates the router so guards re-evaluate immediately.
export function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken } = useAuth()

  setAuthBridge(() => getToken(), !!isSignedIn)

  useEffect(() => {
    router.invalidate()
  }, [isSignedIn])

  return children
}
