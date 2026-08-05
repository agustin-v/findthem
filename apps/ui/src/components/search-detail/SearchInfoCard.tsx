import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { SearchDetail } from '@/lib/api'

interface SearchInfoCardProps {
  search: SearchDetail
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  )
}

export function SearchInfoCard({ search }: SearchInfoCardProps) {
  const { t } = useTranslation('dashboard')
  const { t: ts } = useTranslation('search')

  return (
    <Card
      size="sm"
      className="bg-card/95 backdrop-blur-sm shadow-lg"
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{search.subjectName}</CardTitle>
          <StatusBadge status={search.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col">
        <DetailRow label={t('detail.lastSeen')} value={search.lastSeenAt} />
        <DetailRow label={t('detail.location')} value={search.lastSeenLocation} />
        <DetailRow
          label={t('detail.volunteers', { count: search.volunteerCount })}
          value={String(search.volunteerCount)}
        />
        <DetailRow
          label={t('detail.zones', {
            searched: search.segmentsSearched,
            total: search.totalSegments,
          })}
          value={`${search.segmentsSearched} / ${search.totalSegments}`}
        />
        {Object.entries(search.details).map(([key, value]) => (
          <DetailRow
            key={key}
            label={ts(`fields.${key}`, { defaultValue: key })}
            value={value}
          />
        ))}
      </CardContent>
    </Card>
  )
}
