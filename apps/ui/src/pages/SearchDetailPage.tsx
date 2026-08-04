import { useTranslation } from 'react-i18next'
import { useParams } from '@tanstack/react-router'
import maplibregl from 'maplibre-gl'
import { useCallback, useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
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

export function SearchDetailPage() {
  const { t } = useTranslation('dashboard')
  const { searchId } = useParams({ strict: false }) as { searchId: string }
  const { data: search, isLoading, isError } = useSearch(searchId)
  const { data: volunteers = [], isError: isVolunteersError } = useVolunteers(searchId)
  const segments = useGeoSegmentsStore((s) => s.segmentsBySearch[searchId])
  const restrictedAreas = useGeoSegmentsStore((s) => s.restrictedAreasBySearch[searchId])
  const geoLoading = useGeoSegmentsStore((s) => s.loading)
  const geoError = useGeoSegmentsStore((s) => s.error)

  const generateSegments = useGenerateSegments(searchId)

  const [map, setMap] = useState<maplibregl.Map | null>(null)

  // Auto-generate segments if search has coords but no geo data yet
  useEffect(() => {
    if (
      search?.lastSeenCoords &&
      !segments &&
      !geoLoading &&
      !geoError &&
      !generateSegments.isPending
    ) {
      generateSegments.mutate({
        center: { lat: search.lastSeenCoords.lat, lng: search.lastSeenCoords.lng },
        radius_km: 1.5,
        resources: [{ type: 'people', count: 4 }],
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search?.lastSeenCoords, searchId])

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
        {(geoLoading || generateSegments.isPending) && (
          <Card className="pointer-events-auto absolute bottom-4 right-4 bg-card/95 backdrop-blur-sm shadow-lg">
            <CardContent className="flex items-center gap-2 py-2 px-3">
              <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span className="text-sm text-muted-foreground">
                {t('detail.generatingArea')}
              </span>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
