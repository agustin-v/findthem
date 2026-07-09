import { useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import { MapView } from '@/components/shared/MapView'
import { hasApiKey, getMapStyleUrl } from '@/lib/tomtom'

interface StaticMapPreviewProps {
  lat: number
  lng: number
  className?: string
}

export function StaticMapPreview({ lat, lng, className }: StaticMapPreviewProps) {
  const handleMapReady = useCallback(
    (map: maplibregl.Map) => {
      new maplibregl.Marker({ color: '#1d4ed8' })
        .setLngLat([lng, lat])
        .addTo(map)

      map.scrollZoom.disable()
      map.boxZoom.disable()
      map.dragRotate.disable()
      map.dragPan.disable()
      map.keyboard.disable()
      map.doubleClickZoom.disable()
      map.touchZoomRotate.disable()
    },
    [lat, lng],
  )

  if (!hasApiKey() || (lat === 0 && lng === 0)) return null

  return (
    <MapView
      styleUrl={getMapStyleUrl()}
      center={[lng, lat]}
      zoom={14}
      className={className ?? 'h-[120px] w-full overflow-hidden rounded-md border'}
      onMapReady={handleMapReady}
    />
  )
}
