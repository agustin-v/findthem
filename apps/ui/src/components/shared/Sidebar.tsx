import { useState, type ComponentType } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useUser, UserButton } from '@clerk/react'
import { LayoutGrid, Settings, PanelLeftClose, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/shared/Logo'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { ThemeSwitcher } from '@/components/shared/ThemeSwitcher'

const COLLAPSE_STORAGE_KEY = 'findthem:sidebar-collapsed'

interface SidebarProps {
  /** Compact icon rail with no expand/collapse control — used during the search-creation wizard. */
  forceCollapsed?: boolean
}

interface NavItem {
  to: '/dashboard' | '/dashboard/settings'
  icon: ComponentType<{ className?: string }>
  label: string
  active: boolean
}

export function Sidebar({ forceCollapsed = false }: SidebarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useUser()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [userCollapsed, setUserCollapsed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1',
  )

  const collapsed = forceCollapsed || userCollapsed
  const isSettingsActive = pathname.startsWith('/dashboard/settings')

  const items: NavItem[] = [
    { to: '/dashboard', icon: LayoutGrid, label: t('searches'), active: !isSettingsActive },
    { to: '/dashboard/settings', icon: Settings, label: t('settings'), active: isSettingsActive },
  ]

  const toggle = () => {
    setUserCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || ''

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col gap-1.5 border-r border-border bg-card',
        collapsed ? 'w-16 items-center py-4' : 'w-[230px] p-[18px]',
      )}
    >
      {collapsed ? (
        <Logo size="md" className="mb-2.5" />
      ) : (
        <div className="flex items-center justify-between px-1.5 pt-1 pb-[18px]">
          <div className="flex items-center gap-2.5">
            <Logo size="md" />
            <span className="font-heading text-[19px] font-bold tracking-tight">
              {t('appName')}
            </span>
          </div>
          {!forceCollapsed && (
            <button
              type="button"
              onClick={toggle}
              title={t('collapse')}
              className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] text-muted-foreground hover:bg-muted"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>
      )}

      {items.map((item) =>
        collapsed ? (
          <button
            key={item.to}
            type="button"
            title={item.label}
            onClick={() => navigate({ to: item.to })}
            className={cn(
              'flex size-[42px] items-center justify-center rounded-[10px] transition-colors',
              item.active
                ? 'bg-primary-soft text-primary-soft-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <item.icon className="size-[18px]" />
          </button>
        ) : (
          <button
            key={item.to}
            type="button"
            onClick={() => navigate({ to: item.to })}
            className={cn(
              'flex items-center gap-[11px] rounded-[9px] px-3 py-[11px] text-sm font-medium transition-colors',
              item.active
                ? 'bg-primary-soft text-primary-soft-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <item.icon className="size-[17px]" />
            {item.label}
          </button>
        ),
      )}

      {collapsed && !forceCollapsed && (
        <button
          type="button"
          onClick={toggle}
          title={t('expand')}
          className="flex size-[42px] items-center justify-center rounded-[10px] text-muted-foreground hover:bg-muted"
        >
          <ChevronRight className="size-[18px]" />
        </button>
      )}

      {collapsed ? (
        <div className="mt-auto">
          <UserButton />
        </div>
      ) : (
        <div className="mt-auto flex flex-col gap-2.5 border-t border-border pt-2.5">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground/70">
            <ThemeSwitcher />
            <span>·</span>
            <LanguageSwitcher />
          </div>
          <div className="flex items-center gap-2.5 px-2 pb-1">
            <UserButton />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{displayName}</div>
              <div className="text-[11px] text-muted-foreground">{t('coordinator')}</div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
