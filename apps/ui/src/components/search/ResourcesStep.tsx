import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WizardFooter } from '@/components/search/WizardFooter'
import { cn } from '@/lib/utils'
import { RESOURCE_TYPES } from '@/lib/resource-types'
import type { ResourceType, ResourcesData } from '@/lib/schemas'

const resourceTypes = RESOURCE_TYPES.map((r) => ({ ...r, labelKey: `resources.${r.type}` }))

interface ResourcesStepProps {
  defaultValues?: ResourcesData | null
  onBack: () => void
  onSubmit: (data: ResourcesData) => void
}

export function ResourcesStep({
  defaultValues,
  onBack,
  onSubmit,
}: ResourcesStepProps) {
  const { t } = useTranslation('search')
  const { t: tc } = useTranslation('common')

  const [radiusKm, setRadiusKm] = useState(defaultValues?.radiusKm ?? 1.5)

  const [needSuggestion, setNeedSuggestion] = useState(
    defaultValues?.needSuggestion ?? false,
  )
  const [counts, setCounts] = useState<Record<ResourceType, number>>(() => {
    const map: Record<ResourceType, number> = {
      people: 0,
      motorbikes: 0,
      cars: 0,
      drones: 0,
    }
    if (defaultValues?.resources) {
      for (const r of defaultValues.resources) {
        map[r.type] = r.count
      }
    }
    return map
  })

  const handleIncrement = (type: ResourceType) => {
    setCounts((prev) => ({ ...prev, [type]: prev[type] + 1 }))
  }

  const handleDecrement = (type: ResourceType) => {
    setCounts((prev) => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }))
  }

  const handleSubmit = () => {
    const resources = resourceTypes
      .filter((r) => counts[r.type] > 0)
      .map((r) => ({ type: r.type, count: counts[r.type] }))

    onSubmit({ radiusKm, needSuggestion, resources })
  }

  const hasResources =
    needSuggestion || resourceTypes.some((r) => counts[r.type] > 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="radiusKm" className="text-sm font-semibold">
          {t('resources.radius')}
        </Label>
        <div className="flex items-center gap-2.5">
          <Input
            id="radiusKm"
            type="number"
            min={0.1}
            max={50}
            step={0.1}
            value={radiusKm}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v)) setRadiusKm(v)
            }}
            className="h-11 w-[110px] text-base font-semibold"
          />
          <span className="text-[15px] text-muted-foreground">km</span>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {t('resources.radiusHint')}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setNeedSuggestion(!needSuggestion)}
        className={cn(
          'flex w-full items-center gap-3.5 rounded-xl border p-4 text-left transition-all duration-150',
          needSuggestion
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-foreground/30',
        )}
      >
        <div
          className={cn(
            'flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            needSuggestion
              ? 'border-primary bg-primary'
              : 'border-muted-foreground/40',
          )}
        >
          {needSuggestion && <div className="size-2 rounded-full bg-white" />}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">
            {t('resources.toggle')}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {t('resources.toggleHint')}
          </span>
        </div>
      </button>

      <p className="text-[13px] text-muted-foreground">{t('resources.systemSuggestion')}</p>

      <div
        className={cn(
          'grid grid-cols-2 gap-3 transition-opacity',
          needSuggestion && 'pointer-events-none opacity-40',
        )}
      >
        {resourceTypes.map((resource) => {
          const Icon = resource.icon
          const count = counts[resource.type]
          const isActive = count > 0

          return (
            <div
              key={resource.type}
              style={
                isActive
                  ? ({ '--resource-color': resource.color } as CSSProperties)
                  : undefined
              }
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3.5 transition-all duration-150',
                isActive
                  ? 'border-2 border-[var(--resource-color)] p-[13px] shadow-[0_4px_12px_-4px_var(--resource-color)]'
                  : 'border-border',
              )}
            >
              <div
                className={cn(
                  'flex size-[34px] shrink-0 items-center justify-center rounded-[9px]',
                  isActive ? 'bg-[var(--resource-color)]/10' : 'bg-muted',
                )}
              >
                <Icon
                  className={cn('size-[17px]', !isActive && 'text-muted-foreground')}
                  style={isActive ? { color: resource.color } : undefined}
                />
              </div>
              <span
                className={cn(
                  'flex-1 text-[15px] font-semibold',
                  !isActive && 'text-muted-foreground',
                )}
              >
                {t(resource.labelKey)}
              </span>
              <div className="flex items-center overflow-hidden rounded-lg border border-border">
                <button
                  type="button"
                  aria-label={t('resources.decreaseCount')}
                  disabled={count <= 0}
                  onClick={() => handleDecrement(resource.type)}
                  className="flex size-[30px] items-center justify-center text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="flex size-[32px] items-center justify-center border-x border-border text-[15px] font-bold tabular-nums">
                  {count}
                </span>
                <button
                  type="button"
                  aria-label={t('resources.increaseCount')}
                  onClick={() => handleIncrement(resource.type)}
                  className="flex size-[30px] items-center justify-center text-foreground transition-colors hover:bg-muted"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <WizardFooter>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1"
          onClick={onBack}
        >
          {tc('back')}
        </Button>
        <Button
          type="button"
          className="h-11 flex-1 font-medium"
          disabled={!hasResources}
          onClick={handleSubmit}
        >
          {tc('next')}
        </Button>
      </WizardFooter>
    </div>
  )
}
