import { useEffect, useRef } from 'react'
import type maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import type { SegmentStatusEntry } from '@/lib/api'

const SOURCE_ID = 'segments'
const FILL_LAYER_ID = 'segments-fill'
const LINE_LAYER_ID = 'segments-line'
const LOCK_LINE_LAYER_ID = 'segments-lock-line'
const LOCK_ICON_LAYER_ID = 'segments-lock-icon'
const LOCK_LINE_COLOR = '#1f2937'

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
  // Live per-segment search status (apps/api's real Segment rows, not the
  // geo response) — merged onto each feature so fill-opacity can fade a
  // segment out once it's been searched, independent of resource coloring.
  // Carries lock state too (Story #52/#56), keyed the same way.
  statusBySegmentId?: Map<number, SegmentStatusEntry>
  onSegmentClick?: (segmentId: number) => void
}

// Exported for testing — a naming mismatch here (segmentId vs segment_id)
// previously made every click on the map silently no-op, since nothing
// exercised this function's output against the click handler's expectations.
export function colorSegments(
  geojson: FeatureCollection,
  statusBySegmentId: Map<number, SegmentStatusEntry> | undefined,
): FeatureCollection {
  return {
    ...geojson,
    features: geojson.features.map((f) => {
      const segmentId = f.properties?.segment_id as number | undefined
      const entry = segmentId != null ? statusBySegmentId?.get(segmentId) : undefined
      const status = entry?.status ?? 'not_assigned'
      const locked = entry?.lockedAt != null

      return {
        ...f,
        properties: {
          ...f.properties,
          // camelCase alias — the raw geo feature only carries segment_id
          // (snake_case); the click handler below (and everything
          // downstream, e.g. SegmentAssignmentPanel) reads segmentId.
          segmentId,
          status,
          locked,
          lockReason: entry?.lockReason ?? null,
          color:
            f.properties?.searchable === false
              ? UNSEARCHABLE_COLOR
              : (RESOURCE_COLORS[f.properties?.assigned_resource_type as string] ??
                SEGMENT_COLORS[(segmentId ?? 0) % SEGMENT_COLORS.length]),
        },
      }
    }),
  }
}

export function useSegmentLayer({ map, geojson, statusBySegmentId, onSegmentClick }: UseSegmentLayerOptions) {
  // Kept in a ref so the click listener (registered once, when the layer is
  // first created below) always calls the latest callback without needing
  // to re-register on every render — SearchDetailPage passes a fresh
  // function identity each time.
  const onSegmentClickRef = useRef(onSegmentClick)
  useEffect(() => {
    onSegmentClickRef.current = onSegmentClick
  }, [onSegmentClick])

  const clickHandlerRef = useRef<((e: maplibregl.MapLayerMouseEvent) => void) | null>(null)

  useEffect(() => {
    if (!map || !geojson) return

    const colored = colorSegments(geojson, statusBySegmentId)
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined

    if (source) {
      // Must re-apply color/status on every update too, not just on first
      // mount — a bare setData(geojson) here would silently drop the
      // computed `color`/`status` properties on every status refresh.
      source.setData(colored)
      return
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
          ['==', ['get', 'status'], 'searched'],
          0.05,
          ['==', ['get', 'status'], 'in_progress'],
          0.35,
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

    // Locked segments get a distinct dark dashed outline on top of the
    // resource-color line above (matching useRestrictedAreaLayer's dashed
    // idiom) plus a lock glyph at the polygon's auto-computed label point —
    // discovering a lock only by tapping every segment individually defeats
    // the whole point of a visible lock (avoid duplicate work).
    map.addLayer({
      id: LOCK_LINE_LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'locked'], true],
      paint: {
        'line-color': LOCK_LINE_COLOR,
        'line-width': 2.5,
        'line-dasharray': [2, 2],
      },
    })

    // text-font explicit rather than left to MapLibre's own default — an
    // emoji glyph specifically (unlike ordinary Latin text) is not
    // guaranteed to exist in every style's glyph range, so this only ever
    // adds information; if the glyph doesn't render in a given style, the
    // dashed segments-lock-line layer above and CoverageWidget's "Locked"
    // aggregate count are the load-bearing indicators, not this one.
    map.addLayer({
      id: LOCK_ICON_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['==', ['get', 'locked'], true],
      layout: {
        'text-field': '🔒',
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': 14,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
    })

    const handleClick = (e: maplibregl.MapLayerMouseEvent) => {
      const segmentId = e.features?.[0]?.properties?.segmentId as number | undefined
      if (segmentId != null) onSegmentClickRef.current?.(segmentId)
    }
    clickHandlerRef.current = handleClick
    map.on('click', FILL_LAYER_ID, handleClick)
    map.on('mouseenter', FILL_LAYER_ID, () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', FILL_LAYER_ID, () => {
      map.getCanvas().style.cursor = ''
    })
    // statusBySegmentId is a new Map identity on every fetch — depending on
    // it (rather than a stringified key) is intentional, it's how status
    // refreshes propagate into the layer.
  }, [map, geojson, statusBySegmentId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map) return
      try {
        if (clickHandlerRef.current) map.off('click', FILL_LAYER_ID, clickHandlerRef.current)
        if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID)
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID)
        if (map.getLayer(LOCK_LINE_LAYER_ID)) map.removeLayer(LOCK_LINE_LAYER_ID)
        if (map.getLayer(LOCK_ICON_LAYER_ID)) map.removeLayer(LOCK_ICON_LAYER_ID)
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
      } catch {
        // map may already be removed
      }
    }
  }, [map])
}
