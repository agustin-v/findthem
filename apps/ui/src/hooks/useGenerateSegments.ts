import { useMutation } from '@tanstack/react-query'
import { api, type GenerateSearchParams } from '@/lib/api'
import { useGeoSegmentsStore } from '@/stores/useGeoSegmentsStore'

export function useGenerateSegments(searchId: string) {
  const { setResponse, setLoading, setError } = useGeoSegmentsStore()

  return useMutation({
    mutationFn: (params: GenerateSearchParams) => api.searches.generate(searchId, params),
    onMutate: () => {
      setLoading(true)
    },
    onSuccess: (data) => {
      setResponse(searchId, data)
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to generate segments')
    },
  })
}
