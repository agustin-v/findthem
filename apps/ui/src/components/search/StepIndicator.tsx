import { useTranslation } from 'react-i18next'

interface StepIndicatorProps {
  current: number
  total: number
}

export function StepIndicator({ current, total }: StepIndicatorProps) {
  const { t } = useTranslation('search')

  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] font-medium text-muted-foreground">
        {t('step', { current, total })}
      </span>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={
              i + 1 <= current
                ? 'h-1 w-6 rounded-full bg-[#1d4ed8]'
                : 'h-1 w-6 rounded-full bg-muted'
            }
          />
        ))}
      </div>
    </div>
  )
}
