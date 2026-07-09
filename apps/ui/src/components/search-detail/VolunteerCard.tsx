import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { Volunteer } from '@/lib/api'
import { cn } from '@/lib/utils'

interface VolunteerCardProps {
  volunteers: Volunteer[]
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function VolunteerCard({ volunteers }: VolunteerCardProps) {
  const { t } = useTranslation('dashboard')

  return (
    <Card
      size="sm"
      className="bg-card/95 backdrop-blur-sm shadow-lg"
    >
      <CardHeader>
        <CardTitle>
          {t('detail.volunteersTitle')} ({volunteers.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {volunteers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('detail.noVolunteers')}
          </p>
        ) : (
          <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
            {volunteers.map((v) => (
              <div key={v.id} className="flex items-center gap-2.5">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {getInitials(v.name)}
                </div>
                <span className="flex-1 truncate text-sm">{v.name}</span>
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    v.online ? 'bg-green-500' : 'bg-muted-foreground/30',
                  )}
                  title={v.online ? t('detail.online') : t('detail.offline')}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
