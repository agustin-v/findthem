import { useEffect } from 'react'
import type maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'

const SOURCE_ID = 'restricted-areas'
const FILL_LAYER_ID = 'restricted-areas-fill'
const LINE_LAYER_ID = 'restricted-areas-line'

interface UseRestrictedAreaLayerOptions {
  map: maplibregl.Map | null
  geojson: FeatureCollection | null
}

export function useRestrictedAreaLayer({ map, geojson }: UseRestrictedAreaLayerOptions) {
  useEffect(() => {
    if (!map || !geojson) return

    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData(geojson)
    } else {
      map.addSource(SOURCE_ID, { type: 'geojson', data: geojson })

      map.addLayer({
        id: FILL_LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': '#dc2626',
          'fill-opacity': 0.15,
        },
      })

      map.addLayer({
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#991b1b',
          'line-width': 2,
          'line-opacity': 0.8,
          'line-dasharray': [4, 2],
        },
      })
    }
  }, [map, geojson])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map) return
      try {
        if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID)
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID)
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
      } catch {
        // map may already be removed
      }
    }
  }, [map])
}
