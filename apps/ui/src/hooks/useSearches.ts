import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
    // Keeps the "online" indicator (derived from lastActiveAt) from going
    // stale while a coordinator leaves this page open during an active search.
    refetchInterval: 30_000,
  })
}

export function useJoinPreview(code: string) {
  return useQuery({
    queryKey: ['join-preview', code],
    queryFn: () => api.join.preview(code),
    retry: false,
  })
}

export function useCreateSearch() {
  return useMutation({
    mutationFn: (data: CreateSearchInput) => api.searches.create(data),
  })
}

export function useSetVolunteerStatus(searchId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ volunteerId, status }: { volunteerId: string; status: 'approved' | 'removed' }) =>
      api.volunteers.setStatus(searchId, volunteerId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteers', searchId] })
      queryClient.invalidateQueries({ queryKey: ['searches', searchId] })
    },
  })
}

export function useRotateJoinToken(searchId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.searches.rotateJoinToken(searchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['searches', searchId] })
    },
  })
}
