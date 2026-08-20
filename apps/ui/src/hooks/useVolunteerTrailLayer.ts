import { useEffect } from 'react'
import type maplibregl from 'maplibre-gl'
import type { VolunteerLocation } from '@/lib/api'

const SOURCE_ID = 'volunteer-trail'
const LINE_LAYER_ID = 'volunteer-trail-line'
const POINT_LAYER_ID = 'volunteer-trail-points'

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function trailGeoJson(trail: VolunteerLocation[]): GeoJSON.FeatureCollection {
  if (trail.length === 0) return EMPTY_GEOJSON

  const points: GeoJSON.Feature[] = trail.map((p) => ({
    type: 'Feature',
    properties: { recordedAt: p.recordedAt },
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
  }))

  // A single ping has no line to draw — a 1-coordinate LineString is
  // invalid GeoJSON. The point layer alone still shows it.
  if (trail.length < 2) return { type: 'FeatureCollection', features: points }

  const line: GeoJSON.Feature = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: trail.map((p) => [p.lng, p.lat]),
    },
  }

  return { type: 'FeatureCollection', features: [line, ...points] }
}

interface UseVolunteerTrailLayerOptions {
  map: maplibregl.Map | null
  // null clears the layer (no volunteer selected, or trail not loaded yet)
  trail: VolunteerLocation[] | null
}

// Coverage-review breadcrumb trail (Story 39) — a single volunteer's full
// path, drawn as a line with a point per ping. Same source/layer-add
// pattern as useRestrictedAreaLayer, with one difference: source+layers
// are only created once an actual trail exists, not unconditionally on
// map-ready. useSegmentLayer's own segment fill/line are added
// asynchronously (after the generation hydrate fetch resolves) with no
// beforeId — creating this source/layers eagerly would race that, landing
// the trail underneath the segment fill on some page loads and on top on
// others depending purely on fetch timing. Deferring until a trail is
// actually requested (always after a user click, so always after initial
// load in practice) sidesteps the race instead of fighting layer order.
export function useVolunteerTrailLayer({ map, trail }: UseVolunteerTrailLayerOptions) {
  useEffect(() => {
    if (!map) return

    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined

    if (!trail || trail.length === 0) {
      source?.setData(EMPTY_GEOJSON)
      return
    }

    const geojson = trailGeoJson(trail)

    if (source) {
      source.setData(geojson)
    } else {
      map.addSource(SOURCE_ID, { type: 'geojson', data: geojson })

      map.addLayer({
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': '#1d4ed8',
          'line-width': 3,
          'line-opacity': 0.85,
        },
      })

      map.addLayer({
        id: POINT_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 3,
          'circle-color': '#1d4ed8',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
        },
      })
    }
  }, [map, trail])

  useEffect(() => {
    return () => {
      if (!map) return
      try {
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID)
        if (map.getLayer(POINT_LAYER_ID)) map.removeLayer(POINT_LAYER_ID)
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
      } catch {
        // map may already be removed
      }
    }
  }, [map])
}
