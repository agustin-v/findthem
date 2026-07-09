import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, Bike, Car, Radar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { ResourceType, ResourcesData } from '@/lib/schemas'

const resourceTypes: {
  type: ResourceType
  icon: typeof Users
  labelKey: string
}[] = [
  { type: 'people', icon: Users, labelKey: 'resources.people' },
  { type: 'motorbikes', icon: Bike, labelKey: 'resources.motorbikes' },
  { type: 'cars', icon: Car, labelKey: 'resources.cars' },
  { type: 'drones', icon: Radar, labelKey: 'resources.drones' },
]

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
  const [enabled, setEnabled] = useState<Record<ResourceType, boolean>>(() => {
    const map: Record<ResourceType, boolean> = {
      people: false,
      motorbikes: false,
      cars: false,
      drones: false,
    }
    if (defaultValues?.resources) {
      for (const r of defaultValues.resources) {
        map[r.type] = true
      }
    }
    return map
  })
  const [counts, setCounts] = useState<Record<ResourceType, number>>(() => {
    const map: Record<ResourceType, number> = {
      people: 1,
      motorbikes: 1,
      cars: 1,
      drones: 1,
    }
    if (defaultValues?.resources) {
      for (const r of defaultValues.resources) {
        map[r.type] = r.count
      }
    }
    return map
  })

  const handleToggle = (type: ResourceType) => {
    setEnabled((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  const handleCountChange = (type: ResourceType, value: string) => {
    const num = parseInt(value, 10)
    if (!isNaN(num) && num >= 1) {
      setCounts((prev) => ({ ...prev, [type]: num }))
    }
  }

  const handleSubmit = () => {
    const resources = resourceTypes
      .filter((r) => enabled[r.type])
      .map((r) => ({ type: r.type, count: counts[r.type] }))

    onSubmit({ radiusKm, needSuggestion, resources })
  }

  const hasResources =
    needSuggestion || resourceTypes.some((r) => enabled[r.type])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="radiusKm">{t('resources.radius')}</Label>
        <div className="flex items-center gap-2">
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
            className="h-9 w-24"
          />
          <span className="text-sm text-muted-foreground">km</span>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {t('resources.radiusHint')}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setNeedSuggestion(!needSuggestion)}
        className={cn(
          'flex min-h-[48px] w-full items-center gap-3 rounded-lg border p-3 text-left transition-all duration-150',
          needSuggestion
            ? 'border-[#1d4ed8] bg-[#1d4ed8]/5'
            : 'border-border hover:border-foreground/30',
        )}
      >
        <div
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            needSuggestion
              ? 'border-[#1d4ed8] bg-[#1d4ed8]'
              : 'border-muted-foreground/40',
          )}
        >
          {needSuggestion && (
            <div className="size-2 rounded-full bg-white" />
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">
            {t('resources.toggle')}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {t('resources.toggleHint')}
          </span>
        </div>
      </button>

      <div
        className={cn(
          'grid grid-cols-2 gap-2 transition-opacity',
          needSuggestion && 'pointer-events-none opacity-40',
        )}
      >
        {resourceTypes.map((resource) => {
          const Icon = resource.icon
          const isActive = enabled[resource.type]

          return (
            <div
              key={resource.type}
              className={cn(
                'flex flex-col gap-2 rounded-lg border p-3 transition-all duration-150',
                isActive
                  ? 'border-[#1d4ed8] bg-[#1d4ed8]/5'
                  : 'border-border',
              )}
            >
              <button
                type="button"
                onClick={() => handleToggle(resource.type)}
                className="flex items-center gap-2"
              >
                <div
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-md',
                    isActive ? 'bg-[#1d4ed8]/10' : 'bg-muted',
                  )}
                >
                  <Icon
                    className={cn(
                      'size-4',
                      isActive
                        ? 'text-[#1d4ed8]'
                        : 'text-muted-foreground',
                    )}
                  />
                </div>
                <span
                  className={cn(
                    'text-sm font-medium',
                    !isActive && 'text-muted-foreground',
                  )}
                >
                  {t(resource.labelKey)}
                </span>
              </button>

              {isActive && (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-muted-foreground">
                    {t('resources.count')}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={counts[resource.type]}
                    onChange={(e) =>
                      handleCountChange(resource.type, e.target.value)
                    }
                    className="h-8 w-16 text-center"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-3 pt-1">
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
          className="h-11 flex-1 bg-[#1d4ed8] font-medium hover:bg-[#1d4ed8]/90"
          disabled={!hasResources}
          onClick={handleSubmit}
        >
          {tc('next')}
        </Button>
      </div>
    </div>
  )
}
