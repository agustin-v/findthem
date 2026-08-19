import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Circle, Pause, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type SearchStatus = 'active' | 'suspended' | 'resolved'

const statusConfig: Record<
  SearchStatus,
  { icon: typeof Circle; className: string }
> = {
  active: {
    icon: Circle,
    className: 'bg-actor-coordinator-soft text-actor-coordinator border-actor-coordinator-border',
  },
  suspended: {
    icon: Pause,
    className: 'bg-[#FDF5E7] text-[#B27B12] border-[#F2E2BD]',
  },
  resolved: {
    icon: CheckCircle,
    className: 'bg-actor-volunteer-soft text-actor-volunteer border-actor-volunteer-border',
  },
}

interface StatusBadgeProps {
  status: SearchStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation('dashboard')
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <Badge
      variant="outline"
      className={cn('gap-1 px-2 py-0.5 text-xs', config.className)}
    >
      <Icon className="size-3" />
      {t(`status.${status}`)}
    </Badge>
  )
}
