import { useTranslation } from 'react-i18next'
import type { SegmentStatusEntry } from '@/lib/api'
import type { SegmentsMeta } from '@/lib/geo-api'

const RESOURCE_COLORS: Record<string, string> = {
  people: '#3b82f6',
  motorbikes: '#f59e0b',
  cars: '#10b981',
  drones: '#8b5cf6',
}

interface CoverageWidgetProps {
  segmentStatuses: SegmentStatusEntry[] | undefined
  restrictedCount: number
  meta: SegmentsMeta | undefined
}

function LegendRow({ color, dashed, label, count }: { color: string; dashed?: boolean; label: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span
          className="inline-block size-2.5 shrink-0 rounded-sm"
          style={
            dashed
              ? { border: `1.5px dashed ${color}`, backgroundColor: 'transparent' }
              : { backgroundColor: color }
          }
        />
        {label}
      </span>
      <span className="font-medium text-foreground">{count}</span>
    </div>
  )
}

// Real completion breakdown (searched/in-progress/not-yet-searched, from
// apps/api's persisted segment statuses) plus the resource-type color key
// (from the geo response's meta) — the two things ZoneLegend and the
// zones-searched stat used to show separately, combined into the one
// "Coverage" section the new dock layout gives them.
export function CoverageWidget({ segmentStatuses, restrictedCount, meta }: CoverageWidgetProps) {
  const { t } = useTranslation('dashboard')

  const total = segmentStatuses?.length ?? 0
  const searched = segmentStatuses?.filter((s) => s.status === 'searched').length ?? 0
  const inProgress = segmentStatuses?.filter((s) => s.status === 'in_progress').length ?? 0
  const notYetSearched = total - searched - inProgress
  const pctSearched = total > 0 ? Math.round((searched / total) * 100) : 0

  const resourceTypes = meta?.resource_assignment ? Object.keys(meta.resource_assignment) : []

  if (total === 0) return null

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('detail.coverage.title')}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('detail.coverage.zones', { searched, total })}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-actor-volunteer transition-all"
          style={{ width: `${pctSearched}%` }}
        />
      </div>
      <span className="text-[0.7rem] text-muted-foreground">
        {t('detail.coverage.percentWalked', { percent: pctSearched })}
      </span>

      <div className="mt-1 flex flex-col gap-1">
        <LegendRow color="#2F7D42" label={t('detail.coverage.searched')} count={searched} />
        <LegendRow color="#f59e0b" label={t('detail.coverage.inProgress')} count={inProgress} />
        <LegendRow color="#9ca3af" label={t('detail.coverage.notYetSearched')} count={notYetSearched} />
        {restrictedCount > 0 && (
          <LegendRow
            color="#dc2626"
            dashed
            label={t('detail.legend.restricted')}
            count={restrictedCount}
          />
        )}
      </div>

      <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('detail.legend.title')}
        </span>
        {resourceTypes.length > 0 ? (
          resourceTypes.map((type) => (
            <div key={type} className="flex items-center gap-2">
              <span
                className="inline-block size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: RESOURCE_COLORS[type] ?? '#6b7280' }}
              />
              <span className="text-xs text-muted-foreground">
                {t(`detail.legend.resource.${type}`)}
              </span>
            </div>
          ))
        ) : (
          <div className="flex items-center gap-2">
            <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: '#3b82f6' }} />
            <span className="text-xs text-muted-foreground">{t('detail.legend.segment')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
