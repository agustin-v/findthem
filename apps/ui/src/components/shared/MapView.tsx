import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface MapViewProps {
  styleUrl: string
  center?: [number, number]
  zoom?: number
  className?: string
  onMapReady?: (map: maplibregl.Map) => void
  // Called right before map.remove() — a consumer holding the Map instance
  // in its own state (SearchDetailPage does, for every layer/marker hook to
  // share) must null it out here. Without this, that state keeps pointing
  // at a destroyed Map after a tab round trip (MapView unmounts/remounts),
  // and any effect that later calls a method on it (getSource, addLayer)
  // throws — map.remove() tears down the internal style the moment it
  // runs, it doesn't wait for React to notice.
  onMapDestroy?: () => void
}

const DEFAULT_CENTER: [number, number] = [12.4964, 41.9028]

export function MapView({
  styleUrl,
  center = DEFAULT_CENTER,
  zoom = 12,
  className,
  onMapReady,
  onMapDestroy,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center,
      zoom,
    })

    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      onMapReady?.(map)
    })

    return () => {
      onMapDestroy?.()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl])

  return <div ref={containerRef} className={className} />
}
