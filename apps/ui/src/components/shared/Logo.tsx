import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  /** For placement directly on a solid brand-orange surface: white-on-translucent-white, fixed regardless of theme. */
  inverted?: boolean
  className?: string
}

const MARK_BY_SIZE = {
  sm: 'size-6 rounded-md',
  md: 'size-8 rounded-lg',
  lg: 'size-10 rounded-xl',
} as const

const ICON_BY_SIZE = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-5',
} as const

export function Logo({ size = 'sm', inverted = false, className }: LogoProps) {
  const mark = MARK_BY_SIZE[size]
  const icon = ICON_BY_SIZE[size]

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        inverted
          ? 'bg-white/[0.18]'
          : 'bg-primary shadow-[0_4px_10px_-2px_var(--primary)]',
        mark,
        className,
      )}
    >
      <MapPin
        className={cn(inverted ? 'text-white' : 'text-primary-foreground', icon)}
        strokeWidth={2.5}
      />
    </span>
  )
}
