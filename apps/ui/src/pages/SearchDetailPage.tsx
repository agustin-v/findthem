import { useParams } from '@tanstack/react-router'
import maplibregl from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MapView } from '@/components/shared/MapView'
import { SearchDetailHeader, type SearchDetailTab } from '@/components/search-detail/SearchDetailHeader'
import { SearchOverviewDock } from '@/components/search-detail/SearchOverviewDock'
import { VolunteerTable } from '@/components/search-detail/VolunteerTable'
import { SegmentAssignmentPanel } from '@/components/search-detail/SegmentAssignmentPanel'
import { ChatPanel } from '@/components/search-detail/ChatPanel'
import {
  useSearch,
  useVolunteers,
  useSegments,
  useSegmentAssignments,
  useMessages,
} from '@/hooks/useSearches'
import { useSegmentLayer } from '@/hooks/useSegmentLayer'
import { useRestrictedAreaLayer } from '@/hooks/useRestrictedAreaLayer'
import { useGenerateSegments } from '@/hooks/useGenerateSegments'
import { useSearchChannel } from '@/hooks/useSearchChannel'
import { useGeoSegmentsStore } from '@/stores/useGeoSegmentsStore'
import { usePhotoUploadStore } from '@/stores/usePhotoUploadStore'
import { hasApiKey, getMapStyleUrl } from '@/lib/tomtom'
import { api } from '@/lib/api'

// Fallback radius for a manual retry, when the original wizard-chosen radius
// isn't available here (it's ephemeral, only known at creation time) and the
// search has none persisted yet (it's only persisted on a successful
// generate — which is exactly what a retry means didn't happen).
const RETRY_FALLBACK_RADIUS_KM = 1.5

export function SearchDetailPage() {
  const { t } = useTranslation('dashboard')
  const { searchId } = useParams({ strict: false }) as { searchId: string }
  useSearchChannel(searchId)
  const { data: search, isLoading, isError } = useSearch(searchId)
  const { data: volunteers = [], isError: isVolunteersError } = useVolunteers(searchId)
  const { data: segmentStatuses } = useSegments(searchId)
  const statusBySegmentId = useMemo(
    () => new Map(segmentStatuses?.map((s) => [s.segmentId, s.status])),
    [segmentStatuses],
  )
  const segments = useGeoSegmentsStore((s) => s.segmentsBySearch[searchId])
  const restrictedAreas = useGeoSegmentsStore((s) => s.restrictedAreasBySearch[searchId])
  const meta = useGeoSegmentsStore((s) => s.metaBySearch[searchId])
  const geoLoading = useGeoSegmentsStore((s) => s.loading)
  const geoError = useGeoSegmentsStore((s) => s.error)
  const setResponse = useGeoSegmentsStore((s) => s.setResponse)
  const setLoading = useGeoSegmentsStore((s) => s.setLoading)
  const setError = useGeoSegmentsStore((s) => s.setError)
  const generateSegments = useGenerateSegments(searchId)
  const { data: assignments = [] } = useSegmentAssignments(searchId)
  const {
    data: messages = [],
    isPending: isMessagesPending,
    isError: isMessagesError,
  } = useMessages(searchId)
  const photoUploadFailure = usePhotoUploadStore((s) => s.failuresBySearch[searchId])
  const clearPhotoUploadFailure = usePhotoUploadStore((s) => s.clear)

  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<SearchDetailTab>('map')
  const [chatVolunteerId, setChatVolunteerId] = useState<string | null>(null)

  // Tracks, per volunteer, the inserted_at of the last message the
  // coordinator has actually seen — kept here (not inside ChatPanel) so it
  // survives the Chat tab not being active, which is exactly when a new
  // message needs to still surface as unread rather than silently vanishing.
  const [readUpTo, setReadUpTo] = useState<Record<string, string>>({})
  const seededReadUpToRef = useRef(false)

  // Seed once from whatever's already loaded on first mount, so history
  // predating this page load never counts as "new".
  useEffect(() => {
    if (seededReadUpToRef.current || messages.length === 0) return
    seededReadUpToRef.current = true
    const seed: Record<string, string> = {}
    for (const message of messages) {
      if (!seed[message.volunteerId] || message.insertedAt > seed[message.volunteerId]) {
        seed[message.volunteerId] = message.insertedAt
      }
    }
    setReadUpTo(seed)
  }, [messages])

  // While a thread is actively open on the Chat tab, keep advancing its read
  // marker as new messages arrive (via poll or channel-triggered refetch) so
  // it never shows as unread while the coordinator is already looking at it.
  // Adjusted during render (not an effect) — same "compare against last
  // rendered value" pattern ChatPanel itself uses for its thread-switch reset.
  const openThreadLatestId =
    activeTab === 'chat' && chatVolunteerId
      ? (() => {
          const volunteerMessages = messages.filter((m) => m.volunteerId === chatVolunteerId)
          return volunteerMessages[volunteerMessages.length - 1]?.insertedAt
        })()
      : undefined
  const [trackedOpenThread, setTrackedOpenThread] = useState<{
    volunteerId: string
    insertedAt: string
  } | null>(null)
  if (
    chatVolunteerId &&
    openThreadLatestId &&
    (trackedOpenThread?.volunteerId !== chatVolunteerId ||
      trackedOpenThread.insertedAt !== openThreadLatestId)
  ) {
    setTrackedOpenThread({ volunteerId: chatVolunteerId, insertedAt: openThreadLatestId })
    setReadUpTo((prev) => ({ ...prev, [chatVolunteerId]: openThreadLatestId }))
  }

  const unreadCountByVolunteer = useMemo(() => {
    const map = new Map<string, number>()
    for (const message of messages) {
      if (message.sender === 'volunteer' && message.insertedAt > (readUpTo[message.volunteerId] ?? '')) {
        map.set(message.volunteerId, (map.get(message.volunteerId) ?? 0) + 1)
      }
    }
    return map
  }, [messages, readUpTo])
  const totalUnreadCount = useMemo(
    () => Array.from(unreadCountByVolunteer.values()).reduce((sum, n) => sum + n, 0),
    [unreadCountByVolunteer],
  )

  // Hydrate from the search's latest generation (apps/api). Segments are
  // only ever created via NewSearchPage's create flow — this page never
  // triggers generation itself, so a search with no prior generation
  // simply renders without segment/restricted-area layers.
  useEffect(() => {
    if (!searchId || segments) return
    let cancelled = false
    setLoading(true)
    api.searches
      .getLatestGeneration(searchId)
      .then((data) => {
        if (cancelled) return
        if (data) {
          setResponse(searchId, data)
        } else {
          setLoading(false)
        }
      })
      .catch((error) => {
        if (!cancelled) setError(error instanceof Error ? error.message : 'Failed to load segments')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchId, segments])

  const handleRetryGenerate = useCallback(() => {
    generateSegments.mutate({ radiusKm: RETRY_FALLBACK_RADIUS_KM })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchId])

  const handleMapReady = useCallback(
    (m: maplibregl.Map) => {
      setMap(m)
      if (!search?.lastSeenCoords) return
      new maplibregl.Marker({ color: '#dc2626' })
        .setLngLat([search.lastSeenCoords.lng, search.lastSeenCoords.lat])
        .addTo(m)
    },
    [search?.lastSeenCoords],
  )

  // Wire layers: segments + restricted areas
  useSegmentLayer({
    map,
    geojson: segments ?? null,
    statusBySegmentId,
    onSegmentClick: setSelectedSegmentId,
  })
  useRestrictedAreaLayer({ map, geojson: restrictedAreas ?? null })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Skeleton className="size-16 rounded-full" />
      </div>
    )
  }

  if (isError || !search) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('detail.notFound')}</p>
      </div>
    )
  }

  const canShowMap = hasApiKey() && search.lastSeenCoords
  const approvedVolunteers = volunteers.filter((v) => v.status === 'approved')

  return (
    <div className="flex h-full flex-col">
      <SearchDetailHeader
        search={search}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        approvedVolunteers={approvedVolunteers}
        unreadMessageCount={totalUnreadCount}
      />

      <div className="min-h-0 flex-1">
        {activeTab === 'map' && (
          <div className="flex h-full">
            <SearchOverviewDock
              search={search}
              volunteers={volunteers}
              segmentStatuses={segmentStatuses}
              meta={meta}
              restrictedCount={meta?.restricted_areas_count ?? 0}
              geoLoading={geoLoading}
              geoError={geoError}
              hasSegments={Boolean(segments)}
              onRetryGenerate={handleRetryGenerate}
              isRetrying={generateSegments.isPending}
            />
            <div className="relative min-w-0 flex-1">
              {canShowMap ? (
                <MapView
                  styleUrl={getMapStyleUrl()}
                  center={[search.lastSeenCoords!.lng, search.lastSeenCoords!.lat]}
                  zoom={14}
                  className="absolute inset-0 h-full w-full"
                  onMapReady={handleMapReady}
                />
              ) : (
                <div className="absolute inset-0 bg-muted" />
              )}

              <div className="pointer-events-none absolute inset-0 p-4">
                {selectedSegmentId != null && (
                  <div className="pointer-events-auto absolute bottom-4 right-4 w-72">
                    <SegmentAssignmentPanel
                      searchId={searchId}
                      segmentId={selectedSegmentId}
                      volunteers={volunteers}
                      assignments={assignments}
                      onClose={() => setSelectedSegmentId(null)}
                    />
                  </div>
                )}
                {photoUploadFailure && (
                  <Card className="pointer-events-auto absolute bottom-4 left-4 bg-card/95 backdrop-blur-sm shadow-lg">
                    <CardContent className="flex items-center gap-3 py-2 px-3">
                      <span className="text-sm text-destructive">
                        {t('detail.photoUploadFailed', {
                          count: photoUploadFailure.failed,
                          failed: photoUploadFailure.failed,
                          total: photoUploadFailure.total,
                        })}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => clearPhotoUploadFailure(searchId)}
                      >
                        {t('detail.dismiss')}
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'volunteers' && (
          <VolunteerTable
            searchId={searchId}
            volunteers={volunteers}
            isError={isVolunteersError}
            assignments={assignments}
            onMessage={(volunteerId) => {
              setChatVolunteerId(volunteerId)
              setActiveTab('chat')
            }}
          />
        )}

        {activeTab === 'chat' && (
          <ChatPanel
            searchId={searchId}
            volunteers={volunteers}
            messages={messages}
            isMessagesPending={isMessagesPending}
            isMessagesError={isMessagesError}
            selectedVolunteerId={chatVolunteerId}
            onSelectVolunteer={setChatVolunteerId}
            unreadCountByVolunteer={unreadCountByVolunteer}
            assignments={assignments}
          />
        )}
      </div>
    </div>
  )
}
