import { useParams } from '@tanstack/react-router'
import maplibregl from 'maplibre-gl'
import { MapPinPlus } from 'lucide-react'
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
import { RemarkComposer } from '@/components/search-detail/RemarkComposer'
import {
  useSearch,
  useVolunteers,
  useSegments,
  useSegmentAssignments,
  useMessages,
  useRemarks,
} from '@/hooks/useSearches'
import { useSegmentLayer } from '@/hooks/useSegmentLayer'
import { useRestrictedAreaLayer } from '@/hooks/useRestrictedAreaLayer'
import { useRemarkMarkers } from '@/hooks/useRemarkMarkers'
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
  const { data: remarks = [] } = useRemarks(searchId)
  const photoUploadFailure = usePhotoUploadStore((s) => s.failuresBySearch[searchId])
  const clearPhotoUploadFailure = usePhotoUploadStore((s) => s.clear)

  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<SearchDetailTab>('map')
  const [chatVolunteerId, setChatVolunteerId] = useState<string | null>(null)
  const [placingRemark, setPlacingRemark] = useState(false)
  const [pendingRemarkLocation, setPendingRemarkLocation] = useState<{
    lat: number
    lng: number
  } | null>(null)

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

  // Wire layers: segments + restricted areas. Segment selection is
  // suspended while placing a notice — a tap should place the pin, not
  // also open the segment-assignment popup underneath it.
  const handleSegmentClick = useCallback((segmentId: number | null) => {
    // Mutual exclusion with RemarkComposer — both panels render at the
    // same bottom-right slot, so leaving a pending (unsaved) notice open
    // while also opening the segment panel would silently stack them.
    setPendingRemarkLocation(null)
    setSelectedSegmentId(segmentId)
  }, [])
  useSegmentLayer({
    map,
    geojson: segments ?? null,
    statusBySegmentId,
    onSegmentClick: placingRemark ? undefined : handleSegmentClick,
  })
  useRestrictedAreaLayer({ map, geojson: restrictedAreas ?? null })
  useRemarkMarkers({ map, remarks })

  // "Post a notice" — the next map click while placingRemark is true
  // captures a location and hands off to RemarkComposer instead of
  // submitting anything itself; this hook only owns picking the point.
  useEffect(() => {
    if (!map || !placingRemark) return undefined

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      setPendingRemarkLocation({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      setPlacingRemark(false)
    }

    const canvas = map.getCanvas()
    const previousCursor = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    map.on('click', handleClick)

    return () => {
      map.off('click', handleClick)
      canvas.style.cursor = previousCursor
    }
  }, [map, placingRemark])

  // Leaving the Map tab unmounts RemarkComposer, which would silently
  // discard whatever the coordinator had typed. Rather than let a stale
  // pendingRemarkLocation quietly reopen a *reset* (text lost) composer on
  // return, cancel the in-progress notice outright — an explicit restart
  // is less confusing than a composer that looks unchanged but isn't.
  // Adjusted during render, not an effect — same "compare against last
  // rendered value" pattern as the chat read-marker tracking above.
  const [tabAtLastPlacingCheck, setTabAtLastPlacingCheck] = useState(activeTab)
  if (activeTab !== tabAtLastPlacingCheck) {
    setTabAtLastPlacingCheck(activeTab)
    if (activeTab !== 'map') {
      setPlacingRemark(false)
      setPendingRemarkLocation(null)
    }
  }

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
                {placingRemark ? (
                  <div className="pointer-events-auto absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3 rounded-full bg-card/95 px-4 py-2 shadow-lg backdrop-blur-sm">
                    <span className="text-sm">{t('detail.remarks.tapToPlace')}</span>
                    <Button size="sm" variant="outline" onClick={() => setPlacingRemark(false)}>
                      {t('detail.remarks.cancel')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    // top-20, not top-4 — MapLibre's own NavigationControl
                    // (zoom +/-) already occupies the top-right corner.
                    className="pointer-events-auto absolute right-4 top-20 gap-1.5"
                    onClick={() => {
                      setSelectedSegmentId(null)
                      // A composer may already be open (pendingRemarkLocation
                      // set) — without clearing it here, the next map click
                      // would silently relocate that in-progress notice
                      // instead of starting a fresh one.
                      setPendingRemarkLocation(null)
                      setPlacingRemark(true)
                    }}
                  >
                    <MapPinPlus className="size-3.5" />
                    {t('detail.remarks.postNotice')}
                  </Button>
                )}

                {pendingRemarkLocation && (
                  <div className="pointer-events-auto absolute bottom-4 right-4 w-72">
                    <RemarkComposer
                      // Remounts on a location change instead of carrying
                      // over stale kind/text from whatever was previously
                      // in progress at a different point.
                      key={`${pendingRemarkLocation.lat},${pendingRemarkLocation.lng}`}
                      searchId={searchId}
                      location={pendingRemarkLocation}
                      onClose={() => setPendingRemarkLocation(null)}
                    />
                  </div>
                )}
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
