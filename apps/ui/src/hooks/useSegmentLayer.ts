import { useEffect } from 'react'
import type maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'

const SOURCE_ID = 'segments'
const FILL_LAYER_ID = 'segments-fill'
const LINE_LAYER_ID = 'segments-line'

const RESOURCE_COLORS: Record<string, string> = {
  people: '#3b82f6', // blue
  motorbikes: '#f59e0b', // amber
  cars: '#10b981', // emerald
  drones: '#8b5cf6', // violet
}

const SEGMENT_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
] as const

// Non-searchable segments (restricted / sub-minimum slivers) are inert, not
// assignments — render them gray so they can't masquerade as a resource color.
const UNSEARCHABLE_COLOR = '#9ca3af'

interface UseSegmentLayerOptions {
  map: maplibregl.Map | null
  geojson: FeatureCollection | null
}

export function useSegmentLayer({ map, geojson }: UseSegmentLayerOptions) {
  useEffect(() => {
    if (!map || !geojson) return

    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData(geojson)
    } else {
      // Add color property to features based on segment_id
      const colored: FeatureCollection = {
        ...geojson,
        features: geojson.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            color:
              f.properties?.searchable === false
                ? UNSEARCHABLE_COLOR
                : (RESOURCE_COLORS[f.properties?.assigned_resource_type as string] ??
                  SEGMENT_COLORS[(f.properties?.segment_id ?? 0) % SEGMENT_COLORS.length]),
          },
        })),
      }

      map.addSource(SOURCE_ID, { type: 'geojson', data: colored })

      map.addLayer({
        id: FILL_LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': [
            'case',
            ['==', ['get', 'priority'], 0],
            0.08,
            [
              'interpolate',
              ['linear'],
              ['get', 'priority'],
              1,
              0.22,
              20,
              0.06,
            ],
          ],
        },
      })

      map.addLayer({
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
          'line-opacity': 0.7,
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
