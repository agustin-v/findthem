import { useTranslation } from 'react-i18next'
import { User, PawPrint, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SubjectType } from '@/lib/schemas'

const types: { value: SubjectType; icon: typeof User; descKey: string }[] = [
  { value: 'person', icon: User, descKey: 'subjectType.personDesc' },
  { value: 'animal', icon: PawPrint, descKey: 'subjectType.animalDesc' },
  { value: 'object', icon: Package, descKey: 'subjectType.objectDesc' },
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
    <div className="flex flex-col gap-2">
      {types.map((type) => {
        const Icon = type.icon
        const isSelected = value === type.value

        return (
          <button
            key={type.value}
            type="button"
            onClick={() => onChange(type.value)}
            className={cn(
              'flex min-h-[64px] w-full items-start gap-3 rounded-lg border p-3 text-left transition-all duration-150',
              isSelected
                ? 'border-[#1d4ed8] bg-[#1d4ed8]/5'
                : 'border-border hover:border-foreground/30',
            )}
          >
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-md',
                isSelected ? 'bg-[#1d4ed8]/10' : 'bg-muted',
              )}
            >
              <Icon
                className={cn(
                  'size-4',
                  isSelected ? 'text-[#1d4ed8]' : 'text-muted-foreground',
                )}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {t(`subjectType.${type.value}`)}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {t(type.descKey)}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
