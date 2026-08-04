import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { StepIndicator } from '@/components/search/StepIndicator'
import { SubjectTypeSelector } from '@/components/search/SubjectTypeSelector'
import { PersonForm } from '@/components/search/PersonForm'
import { AnimalForm } from '@/components/search/AnimalForm'
import { ObjectForm } from '@/components/search/ObjectForm'
import { ResourcesStep } from '@/components/search/ResourcesStep'
import { ReviewStep } from '@/components/search/ReviewStep'
import { useCreateSearch } from '@/hooks/useSearches'
import { useSearchCreationStore } from '@/stores/useSearchCreationStore'
import { generateSegments } from '@/lib/geo-api'
import { useGeoSegmentsStore } from '@/stores/useGeoSegmentsStore'
import { ApiError } from '@/lib/api-client'
import type {
  SubjectData,
  PersonData,
  AnimalData,
  ObjectData,
  ResourcesData,
} from '@/lib/schemas'

export function NewSearchPage() {
  const { t } = useTranslation('search')
  const { t: tc } = useTranslation('common')
  const navigate = useNavigate()

  const {
    step,
    subjectType,
    formData,
    resourcesData,
    setStep,
    setSubjectType,
    setFormData,
    setResourcesData,
    reset,
  } = useSearchCreationStore()

  const createSearch = useCreateSearch()
  const { setResponse, setLoading, setError } = useGeoSegmentsStore()

  const handleStep2Submit = (data: SubjectData) => {
    setFormData(data)
    setStep(3)
  }

  const handleCreate = () => {
    if (!subjectType || !formData) return

    createSearch.mutate(
      { subjectType, ...formData, resources: resourcesData },
      {
        onSuccess: (result) => {
          const searchId = result.id

          // Trigger geo segmentation if we have coords and resources
          const coords = 'lastSeenCoords' in formData ? formData.lastSeenCoords : undefined
          if (coords && resourcesData) {
            setLoading(true)
            generateSegments({
              center: { lat: coords.lat, lng: coords.lng },
              radius_km: resourcesData.radiusKm,
              resources: resourcesData.resources.map((r) => ({
                type: r.type,
                count: r.count,
              })),
            })
              .then((data) => setResponse(searchId, data))
              .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
          }

          navigate({ to: '/dashboard/search/$searchId', params: { searchId } })
          reset()
        },
      },
    )
  }

  const handleStep3Submit = (data: ResourcesData) => {
    setResourcesData(data)
    setStep(4)
  }

  const stepTitle =
    step === 1
      ? t('step1Title')
      : step === 2
        ? t('step2Title')
        : step === 3
          ? t('step3Title')
          : t('step4Title')

  return (
    <div className="mx-auto w-full max-w-[600px] px-4 py-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <StepIndicator current={step} total={4} />
          <h1 className="text-base font-semibold">{stepTitle}</h1>
        </div>

        {step === 1 && (
          <>
            <SubjectTypeSelector
              value={subjectType}
              onChange={setSubjectType}
            />
            <Button
              className="h-11 w-full bg-[#1d4ed8] font-medium hover:bg-[#1d4ed8]/90"
              disabled={!subjectType}
              onClick={() => setStep(2)}
            >
              {tc('next')}
            </Button>
          </>
        )}

        {step === 2 && subjectType === 'person' && (
          <PersonForm
            defaultValues={formData as PersonData | undefined}
            onSubmit={handleStep2Submit}
            onBack={() => setStep(1)}
          />
        )}

        {step === 2 && subjectType === 'animal' && (
          <AnimalForm
            defaultValues={formData as AnimalData | undefined}
            onSubmit={handleStep2Submit}
            onBack={() => setStep(1)}
          />
        )}

        {step === 2 && subjectType === 'object' && (
          <ObjectForm
            defaultValues={formData as ObjectData | undefined}
            onSubmit={handleStep2Submit}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <ResourcesStep
            defaultValues={resourcesData}
            onBack={() => setStep(2)}
            onSubmit={handleStep3Submit}
          />
        )}

        {step === 4 && subjectType && formData && (
          <ReviewStep
            subjectType={subjectType}
            data={formData}
            resourcesData={resourcesData}
            onBack={() => setStep(3)}
            onSubmit={handleCreate}
            isSubmitting={createSearch.isPending}
            error={createSearch.isError ? formatCreateError(createSearch.error) : undefined}
          />
        )}
      </div>
    </div>
  )
}

function formatCreateError(error: unknown): string {
  if (error instanceof ApiError && error.errors) {
    return Object.entries(error.errors)
      .map(([field, messages]) => `${field} ${messages.join(', ')}`)
      .join('; ')
  }
  return 'Could not create the search. Please try again.'
}
