import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface MapViewProps {
  styleUrl: string
  center?: [number, number]
  zoom?: number
  className?: string
  onMapReady?: (map: maplibregl.Map) => void
}

const DEFAULT_CENTER: [number, number] = [12.4964, 41.9028]

export function MapView({
  styleUrl,
  center = DEFAULT_CENTER,
  zoom = 12,
  className,
  onMapReady,
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
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl])

  return <div ref={containerRef} className={className} />
}
