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
    className: 'bg-[#1d4ed8]/10 text-[#1d4ed8] border-[#1d4ed8]/20',
  },
  suspended: {
    icon: Pause,
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  resolved: {
    icon: CheckCircle,
    className: 'bg-[#16a34a]/10 text-[#16a34a] border-[#16a34a]/20',
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
