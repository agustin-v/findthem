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
        // Also invalidates the trail key (partial match — every
        // ['volunteer-trail', searchId, *] query) so a coordinator with a
        // trail open doesn't keep showing it after that volunteer is
        // removed or (should a future story add revocation) loses
        // location consent — Locations.list_trail/1 re-evaluates consent
        // server-side on every fetch, but nothing refetches without this.
        channel.on('volunteer_updated', () => {
          queryClient.invalidateQueries({ queryKey: ['volunteers', searchId] })
          queryClient.invalidateQueries({ queryKey: ['volunteer-trail', searchId] })
        })
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
        // useRemarks (Story 37/#46) reads this key — a coordinator-authored
        // or volunteer-authored remark anywhere on the search invalidates it.
        channel.on('remark_created', () =>
          queryClient.invalidateQueries({ queryKey: ['remarks', searchId] }),
        )
        channel.on('message_created', () =>
          queryClient.invalidateQueries({ queryKey: ['messages', searchId] }),
        )
        // Coordinator-only event (Story 38's SearchChannel scoping) — a
        // volunteer's live position. Invalidating the whole volunteers
        // list on every ping (rather than trusting the push payload and
        // patching one volunteer's last_location directly) is the same
        // "wake up sooner, never trust the payload as truth" pattern as
        // every other handler here; ping cadence is bounded (~15m
        // distance-triggered / ~60s idle keepalive per Story 40), so this
        // isn't a hot loop. Also invalidates the trail key — without this,
        // a coordinator watching a volunteer's breadcrumb trail would see
        // their live dot keep moving while the drawn trail line silently
        // stops growing, showing a wrong (incomplete) answer to "was this
        // area actually walked" with no indication it's stale.
        channel.on('location_updated', () => {
          queryClient.invalidateQueries({ queryKey: ['volunteers', searchId] })
          queryClient.invalidateQueries({ queryKey: ['volunteer-trail', searchId] })
        })
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
