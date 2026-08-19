import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { WizardShell } from '@/components/search/WizardShell'
import { WizardFooter } from '@/components/search/WizardFooter'
import { SubjectTypeSelector } from '@/components/search/SubjectTypeSelector'
import { PersonForm } from '@/components/search/PersonForm'
import { AnimalForm } from '@/components/search/AnimalForm'
import { ObjectForm } from '@/components/search/ObjectForm'
import { ResourcesStep } from '@/components/search/ResourcesStep'
import { ReviewStep } from '@/components/search/ReviewStep'
import { useCreateSearch } from '@/hooks/useSearches'
import { useSearchCreationStore } from '@/stores/useSearchCreationStore'
import { api } from '@/lib/api'
import { useGeoSegmentsStore } from '@/stores/useGeoSegmentsStore'
import { usePhotoUploadStore } from '@/stores/usePhotoUploadStore'
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
  const [isGenerating, setIsGenerating] = useState(false)

  const handleStep2Submit = (data: SubjectData) => {
    setFormData(data)
    setStep(3)
  }

  const handleCreate = () => {
    if (!subjectType || !formData) return

    createSearch.mutate(
      { subjectType, ...formData, resources: resourcesData },
      {
        onSuccess: async (result) => {
          const searchId = result.id

          // Trigger segmentation via apps/api (proxies to geo server-side)
          // if we have coords and resources. Awaited before navigating so
          // SearchDetailPage's hydration effect never races an in-flight
          // generate call — by the time it mounts, the generation has
          // already settled (persisted, or the error below is visible).
          const coords = 'lastSeenCoords' in formData ? formData.lastSeenCoords : undefined
          if (coords && resourcesData) {
            setIsGenerating(true)
            setLoading(true)
            try {
              const data = await api.searches.generate(searchId, {
                radiusKm: resourcesData.radiusKm,
                resources: resourcesData.resources.map((r) => ({
                  type: r.type,
                  count: r.count,
                })),
              })
              setResponse(searchId, data)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to generate search segments')
            } finally {
              setIsGenerating(false)
            }
          }

          // Uploaded after the search exists (needs a real searchId) and
          // awaited before navigating, same reasoning as generate above —
          // SearchDetailPage should see the final photo_urls on first
          // render, not an empty list that then pops in later. One request
          // per file via allSettled: a failed photo shouldn't block
          // navigation or take the others down with it — the search itself
          // was already created either way.
          const photos = 'photos' in formData ? formData.photos : undefined
          if (photos?.length) {
            const results = await Promise.allSettled(
              photos.map((file) => api.photos.upload(searchId, file)),
            )
            const failures = results.filter((r) => r.status === 'rejected')
            if (failures.length > 0) {
              console.warn(`${failures.length}/${photos.length} photo upload(s) failed`, failures)
              usePhotoUploadStore.getState().setFailures(searchId, failures.length, photos.length)
            }
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
    <WizardShell step={step} total={4} title={stepTitle}>
      {step === 1 && (
        <>
          <SubjectTypeSelector value={subjectType} onChange={setSubjectType} />
          <WizardFooter className="justify-end">
            <Button
              className="h-11 px-8 font-medium"
              disabled={!subjectType}
              onClick={() => setStep(2)}
            >
              {tc('next')}
            </Button>
          </WizardFooter>
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
          isSubmitting={createSearch.isPending || isGenerating}
          error={createSearch.isError ? formatCreateError(createSearch.error) : undefined}
        />
      )}
    </WizardShell>
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
