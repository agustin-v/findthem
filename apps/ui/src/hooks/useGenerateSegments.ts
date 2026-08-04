import { useMutation } from '@tanstack/react-query'
import { extractZoneCells, generateSegments, type GenerateSegmentsRequest } from '@/lib/geo-api'
import { api } from '@/lib/api'
import { useGeoSegmentsStore } from '@/stores/useGeoSegmentsStore'

export function useGenerateSegments(searchId: string) {
  const { setResponse, setLoading, setError } = useGeoSegmentsStore()

  return useMutation({
    mutationFn: (request: GenerateSegmentsRequest) => generateSegments(request),
    onMutate: () => {
      setLoading(true)
    },
    onSuccess: (data) => {
      setResponse(searchId, data)

      // Best-effort: the volunteer app needs zone rows to render/mark, but a
      // seeding failure here must not disrupt the coordinator seeing their
      // freshly generated segments — they already have them, regardless.
      const cells = extractZoneCells(data.segments)
      if (cells.length > 0) {
        api.searches.seedZones(searchId, cells).catch((error) => {
          console.error('Failed to seed zones for volunteer map', error)
        })
      }
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to generate segments')
    },
  })
}
