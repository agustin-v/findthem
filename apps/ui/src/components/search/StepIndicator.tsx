import { useTranslation } from 'react-i18next'

interface StepIndicatorProps {
  current: number
  total: number
}

export function StepIndicator({ current, total }: StepIndicatorProps) {
  const { t } = useTranslation('search')

  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[13px] tracking-wide text-muted-foreground uppercase">
        {t('step', { current, total })}
      </span>
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={
              i + 1 <= current
                ? 'h-[5px] w-[34px] rounded-full bg-primary'
                : 'h-[5px] w-[34px] rounded-full bg-muted'
            }
          />
        ))}
      </div>
    </div>
  )
}
