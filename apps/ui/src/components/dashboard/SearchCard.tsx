import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { it, enUS } from 'date-fns/locale'
import { User, PawPrint, Package, Users, MapPin, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { Search } from '@/lib/api'

const subjectIcons = {
  person: User,
  animal: PawPrint,
  object: Package,
} as const

interface SearchCardProps {
  search: Search
}

export function SearchCard({ search }: SearchCardProps) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.language === 'it' ? it : enUS
  const Icon = subjectIcons[search.subjectType]

  const timeAgo = formatDistanceToNow(search.createdAt, { locale })

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="size-4" />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{search.subjectName}</span>
          <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
            <span>{t('timeAgo', { time: timeAgo })}</span>
            <span className="flex items-center gap-1">
              <Users className="size-3.5" />
              {t('volunteers', { count: search.volunteerCount })}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              {t('zones', {
                searched: search.zonesSearched,
                total: search.totalZones,
              })}
            </span>
          </div>
        </div>

        <StatusBadge status={search.status} />

        {(search.status === 'active' || search.status === 'resolved') && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            onClick={() =>
              navigate({
                to: '/dashboard/search/$searchId',
                params: { searchId: search.id },
              })
            }
          >
            <ChevronRight className="size-4 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  )
}
