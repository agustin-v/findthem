import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClerkProvider, ClerkLoading, ClerkLoaded } from '@clerk/react'
import '@/lib/i18n'
import './index.css'
import { router } from '@/router'
import { ClerkAuthBridge } from '@/components/shared/ClerkAuthBridge'

const queryClient = new QueryClient()
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <ClerkLoading>
          <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        </ClerkLoading>
        <ClerkLoaded>
          <ClerkAuthBridge>
            <RouterProvider router={router} />
          </ClerkAuthBridge>
        </ClerkLoaded>
      </QueryClientProvider>
    </ClerkProvider>
  </StrictMode>,
)
