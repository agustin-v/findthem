import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { WizardFooter } from '@/components/search/WizardFooter'
import { StaticMapPreview } from '@/components/shared/StaticMapPreview'
import type {
  SubjectType,
  SubjectData,
  PersonData,
  AnimalData,
  ObjectData,
  ResourcesData,
} from '@/lib/schemas'

interface ReviewStepProps {
  subjectType: SubjectType
  data: SubjectData
  resourcesData?: ResourcesData | null
  onBack: () => void
  onSubmit: () => void
  isSubmitting: boolean
  error?: string
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-[13px] text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  )
}

function PhotosRow({ photos }: { photos?: File[] }) {
  const { t } = useTranslation('search')
  const previews = useMemo(
    () => (photos ?? []).map((f) => URL.createObjectURL(f)),
    [photos],
  )

  if (!photos?.length) return null

  return (
    <div className="flex flex-col gap-1 py-1.5">
      <span className="text-[13px] text-muted-foreground">{t('fields.photos')}</span>
      <div className="flex gap-1.5">
        {previews.map((src, i) => (
          <img
            key={src}
            src={src}
            alt={photos[i]?.name}
            className="h-12 w-12 rounded object-cover"
          />
        ))}
      </div>
    </div>
  )
}

function PersonReview({ data }: { data: PersonData }) {
  const { t } = useTranslation('search')
  return (
    <>
      <PhotosRow photos={data.photos} />
      <ReviewRow label={t('fields.name')} value={data.name} />
      <ReviewRow label={t('fields.age')} value={String(data.age)} />
      <ReviewRow label={t('fields.height')} value={data.height} />
      <ReviewRow label={t('fields.weight')} value={data.weight} />
      <ReviewRow
        label={t('fields.physicalDescription')}
        value={data.physicalDescription}
      />
      <ReviewRow label={t('fields.generalDescription')} value={data.generalDescription} />
      <ReviewRow label={t('fields.healthNotes')} value={data.healthNotes} />
      <ReviewRow label={t('fields.contactPhone')} value={data.contactPhone} />
      <ReviewRow label={t('fields.lastSeenAt')} value={data.lastSeenAt} />
      <ReviewRow
        label={t('fields.lastSeenLocation')}
        value={data.lastSeenLocation}
      />
      {data.lastSeenCoords && (
        <StaticMapPreview lat={data.lastSeenCoords.lat} lng={data.lastSeenCoords.lng} />
      )}
      <ReviewRow
        label={t('fields.intendedDestination')}
        value={data.intendedDestination}
      />
    </>
  )
}

function AnimalReview({ data }: { data: AnimalData }) {
  const { t } = useTranslation('search')
  return (
    <>
      <PhotosRow photos={data.photos} />
      <ReviewRow label={t('fields.speciesBreed')} value={data.speciesBreed} />
      <ReviewRow label={t('fields.animalName')} value={data.name} />
      <ReviewRow
        label={t('fields.behaviourNotes')}
        value={data.behaviourNotes}
      />
      <ReviewRow label={t('fields.microchip')} value={data.microchip} />
      <ReviewRow label={t('fields.contactPhone')} value={data.contactPhone} />
      <ReviewRow label={t('fields.lastSeenAt')} value={data.lastSeenAt} />
      <ReviewRow
        label={t('fields.lastSeenLocation')}
        value={data.lastSeenLocation}
      />
      {data.lastSeenCoords && (
        <StaticMapPreview lat={data.lastSeenCoords.lat} lng={data.lastSeenCoords.lng} />
      )}
    </>
  )
}

function ObjectReview({ data }: { data: ObjectData }) {
  const { t } = useTranslation('search')
  return (
    <>
      <PhotosRow photos={data.photos} />
      <ReviewRow label={t('fields.description')} value={data.description} />
      <ReviewRow label={t('fields.sizeWeight')} value={data.sizeWeight} />
      <ReviewRow
        label={t('fields.lastKnownState')}
        value={data.lastKnownState}
      />
      <ReviewRow label={t('fields.contactPhone')} value={data.contactPhone} />
      <ReviewRow label={t('fields.lastSeenAt')} value={data.lastSeenAt} />
      <ReviewRow
        label={t('fields.lastSeenLocation')}
        value={data.lastSeenLocation}
      />
      {data.lastSeenCoords && (
        <StaticMapPreview lat={data.lastSeenCoords.lat} lng={data.lastSeenCoords.lng} />
      )}
    </>
  )
}

export function ReviewStep({
  subjectType,
  data,
  resourcesData,
  onBack,
  onSubmit,
  isSubmitting,
  error,
}: ReviewStepProps) {
  const { t } = useTranslation('search')
  const { t: tc } = useTranslation('common')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4 py-1.5">
        <span className="shrink-0 text-[13px] text-muted-foreground">
          {t('review.subjectType')}
        </span>
        <span className="text-right text-sm font-medium">
          {t(`review.${subjectType}`)}
        </span>
      </div>

      <Separator />

      <div className="flex flex-col">
        {subjectType === 'person' && (
          <PersonReview data={data as PersonData} />
        )}
        {subjectType === 'animal' && (
          <AnimalReview data={data as AnimalData} />
        )}
        {subjectType === 'object' && (
          <ObjectReview data={data as ObjectData} />
        )}
      </div>

      <Separator />

      {resourcesData && (
        <>
          <div className="flex flex-col gap-1 py-1.5">
            <span className="text-[13px] font-medium">
              {t('resources.title')}
            </span>
            <ReviewRow label={t('resources.radius')} value={`${resourcesData.radiusKm} km`} />
            {resourcesData.needSuggestion ? (
              <span className="text-sm text-muted-foreground">
                {t('resources.systemSuggestion')}
              </span>
            ) : (
              <div className="flex flex-col">
                {resourcesData.resources.map((r) => (
                  <ReviewRow
                    key={r.type}
                    label={t(`resources.${r.type}`)}
                    value={String(r.count)}
                  />
                ))}
              </div>
            )}
          </div>
          <Separator />
        </>
      )}

      <p className="text-[13px] text-muted-foreground">{t('reviewNote')}</p>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      <WizardFooter>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1"
          onClick={onBack}
          disabled={isSubmitting}
        >
          {tc('back')}
        </Button>
        <Button
          type="button"
          className="h-11 flex-1 font-medium"
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? t('creating') : t('createSearch')}
        </Button>
      </WizardFooter>
    </div>
  )
}
