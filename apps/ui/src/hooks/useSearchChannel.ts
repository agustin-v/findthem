import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Channel } from 'phoenix'
import { getSocket } from '@/lib/socket'
import { useGeoSegmentsStore } from '@/stores/useGeoSegmentsStore'
import type { SegmentsResponse } from '@/lib/geo-api'

// Relays FindThemApiWeb.SearchChannel's events into the same caches the
// existing REST+poll hooks already populate (useVolunteers, useSegments,
// useSegmentAssignments, useSearch) plus the geo Zustand store. Purely a
// "wake up sooner" layer on top of what's already there — every event
// handler just invalidates, it never trusts the push payload as the source
// of truth, so a missed or duplicate event is harmless (the next poll or
// invalidate just re-fetches the same data via the existing query fns).
export function useSearchChannel(searchId: string | undefined) {
  const queryClient = useQueryClient()
  const setGeoResponse = useGeoSegmentsStore((s) => s.setResponse)

  useEffect(() => {
    if (!searchId) return

    let channel: Channel | null = null
    let cancelled = false

    getSocket()
      .then((socket) => {
        if (cancelled) return

        channel = socket.channel(`search:${searchId}`, {})

        channel.on('volunteer_joined', () =>
          queryClient.invalidateQueries({ queryKey: ['volunteers', searchId] }),
        )
        channel.on('volunteer_updated', () =>
          queryClient.invalidateQueries({ queryKey: ['volunteers', searchId] }),
        )
        channel.on('segment_updated', () =>
          queryClient.invalidateQueries({ queryKey: ['segments', searchId] }),
        )
        channel.on('segment_assignment_created', () =>
          queryClient.invalidateQueries({ queryKey: ['segment-assignments', searchId] }),
        )
        channel.on('segment_assignment_removed', () =>
          queryClient.invalidateQueries({ queryKey: ['segment-assignments', searchId] }),
        )
        channel.on('search_updated', () =>
          queryClient.invalidateQueries({ queryKey: ['searches', searchId] }),
        )
        channel.on('search_created', () =>
          queryClient.invalidateQueries({ queryKey: ['searches'] }),
        )
        // No UI reads a 'remarks' query yet (Story 37/#46) — invalidating an
        // unregistered key is a harmless no-op, and it means that future hook
        // goes live for free the moment it exists, no channel change needed.
        channel.on('remark_created', () =>
          queryClient.invalidateQueries({ queryKey: ['remarks', searchId] }),
        )
        channel.on('message_created', () =>
          queryClient.invalidateQueries({ queryKey: ['messages', searchId] }),
        )
        // The geo response isn't a React Query cache — it's push-only into
        // the Zustand store directly, same shape useGenerateSegments already
        // writes on a manual (re)generate.
        channel.on('generation_created', (push: { data: { response: SegmentsResponse } }) => {
          setGeoResponse(searchId, push.data.response)
        })

        channel
          .join()
          .receive('error', (reason) => {
            // Not fatal — every event above just wakes up an existing
            // REST+poll path sooner, so a failed join means "stay on
            // polling cadence", not "this screen is broken". Logged so a
            // systemic auth/authorization problem is at least visible in
            // dev tools instead of manifesting only as "felt a bit slower".
            console.warn(`search:${searchId} channel join failed`, reason)
          })
      })
      .catch((error) => {
        console.warn('Realtime socket unavailable, continuing on REST polling', error)
      })

    return () => {
      cancelled = true
      channel?.leave()
    }
  }, [searchId, queryClient, setGeoResponse])
}
