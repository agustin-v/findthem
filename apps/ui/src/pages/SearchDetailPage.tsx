import { useTranslation } from 'react-i18next'
import { useParams } from '@tanstack/react-router'
import maplibregl from 'maplibre-gl'
import { useCallback, useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MapView } from '@/components/shared/MapView'
import { SearchInfoCard } from '@/components/search-detail/SearchInfoCard'
import { VolunteerCard } from '@/components/search-detail/VolunteerCard'
import { InvitePanel } from '@/components/search-detail/InvitePanel'
import { ZoneLegend } from '@/components/search-detail/ZoneLegend'
import { useSearch, useVolunteers } from '@/hooks/useSearches'
import { useSegmentLayer } from '@/hooks/useSegmentLayer'
import { useRestrictedAreaLayer } from '@/hooks/useRestrictedAreaLayer'
import { useGenerateSegments } from '@/hooks/useGenerateSegments'
import { useGeoSegmentsStore } from '@/stores/useGeoSegmentsStore'
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
  const { data: search, isLoading, isError } = useSearch(searchId)
  const { data: volunteers = [], isError: isVolunteersError } = useVolunteers(searchId)
  const segments = useGeoSegmentsStore((s) => s.segmentsBySearch[searchId])
  const restrictedAreas = useGeoSegmentsStore((s) => s.restrictedAreasBySearch[searchId])
  const geoLoading = useGeoSegmentsStore((s) => s.loading)
  const geoError = useGeoSegmentsStore((s) => s.error)
  const setResponse = useGeoSegmentsStore((s) => s.setResponse)
  const setLoading = useGeoSegmentsStore((s) => s.setLoading)
  const setError = useGeoSegmentsStore((s) => s.setError)
  const generateSegments = useGenerateSegments(searchId)

  const [map, setMap] = useState<maplibregl.Map | null>(null)

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
  useSegmentLayer({ map, geojson: segments ?? null })
  useRestrictedAreaLayer({ map, geojson: restrictedAreas ?? null })

  if (isLoading) {
    return (
      <div className="flex h-[calc(100dvh-48px)] items-center justify-center">
        <Skeleton className="size-16 rounded-full" />
      </div>
    )
  }

  if (isError || !search) {
    return (
      <div className="flex h-[calc(100dvh-48px)] items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('detail.notFound')}</p>
      </div>
    )
  }

  const canShowMap = hasApiKey() && search.lastSeenCoords

  return (
    <div className="relative h-[calc(100dvh-48px)] overflow-hidden">
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

      <div className="pointer-events-none absolute inset-0 z-10 p-4">
        <div className="pointer-events-auto absolute left-4 top-4 w-80">
          <SearchInfoCard search={search} />
        </div>
        <div className="pointer-events-auto absolute right-4 top-4 flex w-72 flex-col gap-4">
          <InvitePanel searchId={searchId} joinToken={search.joinToken} />
          <VolunteerCard searchId={searchId} volunteers={volunteers} isError={isVolunteersError} />
        </div>
        <div className="pointer-events-auto absolute bottom-4 left-4 w-48">
          <ZoneLegend />
        </div>
        {geoLoading && (
          <Card className="pointer-events-auto absolute bottom-4 right-4 bg-card/95 backdrop-blur-sm shadow-lg">
            <CardContent className="flex items-center gap-2 py-2 px-3">
              <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span className="text-sm text-muted-foreground">
                {t('detail.generatingArea')}
              </span>
            </CardContent>
          </Card>
        )}
        {!geoLoading && geoError && !segments && (
          <Card className="pointer-events-auto absolute bottom-4 right-4 bg-card/95 backdrop-blur-sm shadow-lg">
            <CardContent className="flex items-center gap-3 py-2 px-3">
              <span className="text-sm text-destructive">{t('detail.generateFailed')}</span>
              <Button size="sm" variant="outline" onClick={handleRetryGenerate}>
                {t('detail.retryGenerate')}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
