import { useTranslation } from 'react-i18next'
import { User, PawPrint, Package, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SubjectType } from '@/lib/schemas'

const types: {
  value: SubjectType
  icon: typeof User
  descKey: string
  iconBg: string
  iconColor: string
}[] = [
  {
    value: 'person',
    icon: User,
    descKey: 'subjectType.personDesc',
    iconBg: 'bg-actor-coordinator-soft',
    iconColor: 'text-actor-coordinator',
  },
  {
    value: 'animal',
    icon: PawPrint,
    descKey: 'subjectType.animalDesc',
    iconBg: 'bg-actor-volunteer-soft',
    iconColor: 'text-actor-volunteer',
  },
  {
    value: 'object',
    icon: Package,
    descKey: 'subjectType.objectDesc',
    iconBg: 'bg-actor-privacy-soft',
    iconColor: 'text-actor-privacy',
  },
]

interface SubjectTypeSelectorProps {
  value: SubjectType | null
  onChange: (type: SubjectType) => void
}

export function SubjectTypeSelector({
  value,
  onChange,
}: SubjectTypeSelectorProps) {
  const { t } = useTranslation('search')

  return (
    <div className="flex flex-col gap-3">
      {types.map((type) => {
        const Icon = type.icon
        const isSelected = value === type.value

        return (
          <button
            key={type.value}
            type="button"
            onClick={() => onChange(type.value)}
            className={cn(
              'flex w-full items-center gap-[18px] rounded-[14px] border bg-card p-5 text-left transition-all duration-150',
              isSelected
                ? 'border-2 border-primary p-[19px] shadow-[0_6px_16px_rgba(228,87,27,0.10)]'
                : 'border-border hover:border-foreground/30',
            )}
          >
            <div
              className={cn(
                'flex size-[50px] shrink-0 items-center justify-center rounded-xl',
                type.iconBg,
              )}
            >
              <Icon className={cn('size-6', type.iconColor)} />
            </div>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-[19px] font-semibold">
                {t(`subjectType.${type.value}`)}
              </span>
              <span className="text-sm text-muted-foreground">
                {t(type.descKey)}
              </span>
            </div>
            <div
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30',
              )}
            >
              {isSelected && <Check className="size-3.5 text-primary-foreground" strokeWidth={3} />}
            </div>
          </button>
        )
      })}
    </div>
  )
}
