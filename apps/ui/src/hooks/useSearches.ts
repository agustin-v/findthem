import { useQuery, useMutation } from '@tanstack/react-query'
import { api, type CreateSearchInput } from '@/lib/api'

export function useSearches() {
  return useQuery({
    queryKey: ['searches'],
    queryFn: api.searches.list,
  })
}

export function useSearch(id: string) {
  return useQuery({
    queryKey: ['searches', id],
    queryFn: () => api.searches.getById(id),
  })
}

export function useVolunteers(searchId: string) {
  return useQuery({
    queryKey: ['volunteers', searchId],
    queryFn: () => api.volunteers.listBySearch(searchId),
  })
}

export function useCreateSearch() {
  return useMutation({
    mutationFn: (data: CreateSearchInput) => api.searches.create(data),
  })
}
