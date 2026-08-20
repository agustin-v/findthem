import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type CreateSearchInput, type RemarkKind } from '@/lib/api'

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
    // The other three search-detail queries all have a poll fallback (see
    // useVolunteers/useSegments/useSegmentAssignments below) so the
    // realtime channel degrading to "quietly falls back to polling" is
    // actually true for them — this one needs the same fallback to make
    // that claim true here too.
    refetchInterval: 30_000,
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

export function useSegments(searchId: string) {
  return useQuery({
    queryKey: ['segments', searchId],
    queryFn: () => api.segments.getBySearch(searchId),
    // Mirrors apps/mobile's map.tsx poll interval, so a coordinator watching
    // the same search sees volunteer progress on roughly the same cadence.
    refetchInterval: 15_000,
  })
}

export function useSegmentAssignments(searchId: string) {
  return useQuery({
    queryKey: ['segment-assignments', searchId],
    queryFn: () => api.segmentAssignments.getBySearch(searchId),
    refetchInterval: 15_000,
  })
}

export function useAssignVolunteer(searchId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ segmentId, volunteerId }: { segmentId: number; volunteerId: string }) =>
      api.segmentAssignments.assign(searchId, segmentId, volunteerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segment-assignments', searchId] })
    },
  })
}

export function useUnassignVolunteer(searchId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ segmentId, volunteerId }: { segmentId: number; volunteerId: string }) =>
      api.segmentAssignments.unassign(searchId, segmentId, volunteerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segment-assignments', searchId] })
    },
  })
}

export function useMessages(searchId: string) {
  return useQuery({
    queryKey: ['messages', searchId],
    queryFn: () => api.messages.listBySearch(searchId),
    refetchInterval: 15_000,
  })
}

export function useSendMessage(searchId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ volunteerId, text }: { volunteerId: string; text: string }) =>
      api.messages.send(searchId, volunteerId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', searchId] })
    },
  })
}

export function useRemarks(searchId: string) {
  return useQuery({
    queryKey: ['remarks', searchId],
    queryFn: () => api.remarks.listBySearch(searchId),
    // remark_created already invalidates this exact key (useSearchChannel.ts)
    // — the poll is just a fallback for a missed/dropped realtime event.
    refetchInterval: 30_000,
  })
}

export function useCreateRemark(searchId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { kind: RemarkKind; text?: string; lat: number; lng: number }) =>
      api.remarks.create(searchId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarks', searchId] })
    },
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

// Fetched on demand (enabled: false by default), not polled — a
// breadcrumb trail is for coverage review, not something that needs to
// stay live while a coordinator has it open.
export function useVolunteerTrail(searchId: string, volunteerId: string | null) {
  return useQuery({
    queryKey: ['volunteer-trail', searchId, volunteerId],
    queryFn: () => api.volunteers.getTrail(searchId, volunteerId!),
    enabled: volunteerId != null,
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
