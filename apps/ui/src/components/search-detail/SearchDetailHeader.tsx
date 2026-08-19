import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Map as MapIcon, Users, MessageCircle, Plus } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { InvitePanel } from '@/components/search-detail/InvitePanel'
import { initials } from '@/lib/initials'
import type { SearchDetail, Volunteer } from '@/lib/api'

export type SearchDetailTab = 'map' | 'volunteers' | 'chat'

interface SearchDetailHeaderProps {
  search: SearchDetail
  activeTab: SearchDetailTab
  onTabChange: (tab: SearchDetailTab) => void
  approvedVolunteers: Volunteer[]
  unreadMessageCount: number
}

function AvatarStack({ volunteers }: { volunteers: Volunteer[] }) {
  const shown = volunteers.slice(0, 2)
  const overflow = volunteers.length - shown.length
  if (shown.length === 0) return null
  return (
    <span className="flex -space-x-1.5">
      {shown.map((v) => (
        <span
          key={v.id}
          className="flex size-4 items-center justify-center rounded-full border border-card bg-actor-coordinator text-[0.55rem] font-medium text-actor-coordinator-soft"
        >
          {initials(v.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="flex size-4 items-center justify-center rounded-full border border-card bg-muted text-[0.55rem] font-medium text-muted-foreground">
          +{overflow}
        </span>
      )}
    </span>
  )
}

export function SearchDetailHeader({
  search,
  activeTab,
  onTabChange,
  approvedVolunteers,
  unreadMessageCount,
}: SearchDetailHeaderProps) {
  const { t } = useTranslation('dashboard')
  const { t: tc } = useTranslation('common')
  const navigate = useNavigate()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5">
      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <button
          type="button"
          onClick={() => navigate({ to: '/dashboard' })}
          className="text-muted-foreground hover:text-foreground"
        >
          {tc('searches')}
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="truncate font-semibold">{search.subjectName}</span>
        <StatusBadge status={search.status} />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as SearchDetailTab)}>
        <TabsList className="h-10">
          <TabsTrigger value="map" className="gap-1.5 px-3 py-1.5 data-active:bg-card">
            <MapIcon className="size-3.5" />
            {t('detail.tabs.map')}
          </TabsTrigger>
          <TabsTrigger value="volunteers" className="gap-1.5 px-3 py-1.5 data-active:bg-card">
            <Users className="size-3.5" />
            {t('detail.tabs.volunteers')}
            <AvatarStack volunteers={approvedVolunteers} />
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5 px-3 py-1.5 data-active:bg-card">
            <MessageCircle className="size-3.5" />
            {t('detail.tabs.chat')}
            {unreadMessageCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.65rem] font-medium text-white">
                {unreadMessageCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex w-[88px] shrink-0 justify-end">
        {activeTab === 'volunteers' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" className="gap-1.5">
                <Plus className="size-3.5" />
                {t('detail.invite.button')}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <PopoverHeader>
                <PopoverTitle>{t('detail.invite.title')}</PopoverTitle>
              </PopoverHeader>
              <InvitePanel searchId={search.id} joinToken={search.joinToken} />
            </PopoverContent>
          </Popover>
        )}
      </div>
    </header>
  )
}
