import { Outlet, useMatches } from '@tanstack/react-router'
import { Sidebar } from '@/components/shared/Sidebar'

export function AppLayout() {
  const matches = useMatches()
  const isWizard = matches.some((m) => m.routeId === '/dashboard/search/new')

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar forceCollapsed={isWizard} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
