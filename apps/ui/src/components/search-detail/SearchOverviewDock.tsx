import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { it, enUS } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { CoverageWidget } from '@/components/search-detail/CoverageWidget'
import type { SearchDetail, SegmentStatusEntry, Volunteer } from '@/lib/api'
import type { SegmentsMeta } from '@/lib/geo-api'

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000

function isOnline(lastActiveAt: string | null) {
  if (!lastActiveAt) return false
  return Date.now() - new Date(lastActiveAt).getTime() < ONLINE_THRESHOLD_MS
}

interface StatProps {
  label: string
  value: string
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.7rem] text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  )
}

interface SearchOverviewDockProps {
  search: SearchDetail
  volunteers: Volunteer[]
  segmentStatuses: SegmentStatusEntry[] | undefined
  meta: SegmentsMeta | undefined
  restrictedCount: number
  geoLoading: boolean
  geoError: string | null
  hasSegments: boolean
  onRetryGenerate: () => void
  isRetrying: boolean
}

export function SearchOverviewDock({
  search,
  volunteers,
  segmentStatuses,
  meta,
  restrictedCount,
  geoLoading,
  geoError,
  hasSegments,
  onRetryGenerate,
  isRetrying,
}: SearchOverviewDockProps) {
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.language === 'it' ? it : enUS

  const approvedVolunteers = volunteers.filter((v) => v.status === 'approved')
  const liveCount = approvedVolunteers.filter((v) => isOnline(v.lastActiveAt)).length

  return (
    <div className="flex h-full w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-card p-4">
      <div>
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {t(`detail.subjectKind.${search.subjectType}`)}
        </span>
        <h1 className="font-heading text-lg font-bold">{search.subjectName}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label={t('detail.lastSeen')}
          value={
            search.lastSeenAt
              ? formatDistanceToNow(new Date(search.lastSeenAt), { locale, addSuffix: true })
              : '—'
          }
        />
        {meta?.radius_km != null && (
          <Stat label={t('detail.radius')} value={`${meta.radius_km} km`} />
        )}
        <Stat
          label={t('detail.volunteers', { count: search.volunteerCount })}
          value={t('detail.volunteersLiveCount', { total: approvedVolunteers.length, live: liveCount })}
        />
        <Stat
          label={t('detail.zonesCleared')}
          value={`${search.segmentsSearched} / ${search.totalSegments}`}
        />
      </div>

      {search.lastSeenLocation && (
        <div className="flex flex-col gap-0.5 border-t border-border pt-2">
          <span className="text-[0.7rem] text-muted-foreground">{t('detail.location')}</span>
          <span className="text-sm">{search.lastSeenLocation}</span>
        </div>
      )}

      {geoLoading && (
        <p className="border-t border-border pt-3 text-sm text-muted-foreground">
          {t('detail.generatingArea')}
        </p>
      )}
      {!geoLoading && geoError && !hasSegments && (
        <div className="flex flex-col items-start gap-2 border-t border-border pt-3">
          <span className="text-sm text-destructive">{t('detail.generateFailed')}</span>
          <Button size="sm" variant="outline" onClick={onRetryGenerate} disabled={isRetrying}>
            {t('detail.retryGenerate')}
          </Button>
        </div>
      )}

      <CoverageWidget segmentStatuses={segmentStatuses} restrictedCount={restrictedCount} meta={meta} />
    </div>
  )
}
