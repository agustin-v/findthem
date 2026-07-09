import { Outlet, useNavigate, useMatches } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { ThemeSwitcher } from '@/components/shared/ThemeSwitcher'
import { useAuth } from '@/hooks/useAuth'
import { useSearch } from '@/hooks/useSearches'

function BreadcrumbSegment({ searchId }: { searchId: string }) {
  const { data: search } = useSearch(searchId)
  if (!search) return null
  return (
    <>
      <span className="text-muted-foreground/40 mx-1">&gt;</span>
      <span className="truncate">{search.subjectName}</span>
    </>
  )
}

export function AppLayout() {
  const { t } = useTranslation('common')
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const matches = useMatches()

  const detailMatch = matches.find(
    (m) => m.routeId === '/dashboard/search/$searchId',
  )
  const searchId = (detailMatch?.params as { searchId?: string })?.searchId

  const handleLogout = () => {
    logout()
    navigate({ to: '/' })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center text-base font-semibold tracking-tight">
          <button onClick={() => navigate({ to: '/dashboard' })}>
            {t('appName')}
          </button>
          {searchId && <BreadcrumbSegment searchId={searchId} />}
        </div>
        <div className="flex items-center gap-1">
          <ThemeSwitcher />
          <span className="text-muted-foreground/40">·</span>
          <LanguageSwitcher />
          <span className="text-muted-foreground/40">·</span>
          <span className="text-[13px] text-muted-foreground">
            {user?.name || user?.email}
          </span>
          <span className="text-muted-foreground/40">·</span>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[44px] text-[13px] text-muted-foreground"
            onClick={handleLogout}
          >
            {t('logout')}
          </Button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
