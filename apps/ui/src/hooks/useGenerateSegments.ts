import { useMutation } from '@tanstack/react-query'
import { generateSegments, type GenerateSegmentsRequest } from '@/lib/geo-api'
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
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to generate segments')
    },
  })
}
