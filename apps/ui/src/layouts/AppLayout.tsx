import { Outlet, useNavigate, useMatches } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Sidebar } from '@/components/shared/Sidebar'
import { useSearch } from '@/hooks/useSearches'

function BreadcrumbSegment({ searchId }: { searchId: string }) {
  const { data: search } = useSearch(searchId)
  if (!search) return null
  return <span className="truncate font-semibold">{search.subjectName}</span>
}

export function AppLayout() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const matches = useMatches()

  const detailMatch = matches.find((m) => m.routeId === '/dashboard/search/$searchId')
  const searchId = (detailMatch?.params as { searchId?: string })?.searchId
  const isWizard = matches.some((m) => m.routeId === '/dashboard/search/new')

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar forceCollapsed={isWizard} />
      <div className="flex min-w-0 flex-1 flex-col">
        {searchId && (
          <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-5 text-sm">
            <button
              onClick={() => navigate({ to: '/dashboard' })}
              className="text-muted-foreground hover:text-foreground"
            >
              {t('searches')}
            </button>
            <span className="text-muted-foreground/40">/</span>
            <BreadcrumbSegment searchId={searchId} />
          </header>
        )}
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
