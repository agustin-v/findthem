import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useGeoSegmentsStore } from '@/stores/useGeoSegmentsStore'
import { useParams } from '@tanstack/react-router'

const RESOURCE_COLORS: Record<string, string> = {
  people: '#3b82f6',
  motorbikes: '#f59e0b',
  cars: '#10b981',
  drones: '#8b5cf6',
}

const RESTRICTED_ITEM = { color: '#dc2626', key: 'restricted' } as const

export function ZoneLegend() {
  const { t } = useTranslation('dashboard')
  const { searchId } = useParams({ strict: false }) as { searchId?: string }
  const meta = useGeoSegmentsStore(
    (s) => (searchId ? s.metaBySearch[searchId] : undefined),
  )

  const resourceTypes = meta?.resource_assignment
    ? Object.keys(meta.resource_assignment)
    : []

  return (
    <Card size="sm" className="bg-card/95 backdrop-blur-sm shadow-lg">
      <CardHeader>
        <CardTitle>{t('detail.legend.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {resourceTypes.length > 0
          ? resourceTypes.map((type) => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className="inline-block size-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: RESOURCE_COLORS[type] ?? '#6b7280' }}
                />
                <span className="text-xs text-muted-foreground">
                  {t(`detail.legend.resource.${type}`)}
                </span>
              </div>
            ))
          : (
              <div className="flex items-center gap-2">
                <span
                  className="inline-block size-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: '#3b82f6' }}
                />
                <span className="text-xs text-muted-foreground">
                  {t('detail.legend.segment')}
                </span>
              </div>
            )}
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-3 shrink-0 rounded-sm"
            style={{ backgroundColor: RESTRICTED_ITEM.color }}
          />
          <span className="text-xs text-muted-foreground">
            {t(`detail.legend.${RESTRICTED_ITEM.key}`)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
