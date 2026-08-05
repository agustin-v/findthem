import type { FeatureCollection } from 'geojson'
import { colorSegments } from './useSegmentLayer'

function geoSegments(features: { segment_id: number; searchable?: boolean }[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.map(({ segment_id, searchable }) => ({
      type: 'Feature',
      properties: { segment_id, searchable },
      geometry: { type: 'Polygon', coordinates: [] },
    })),
  }
}

describe('colorSegments', () => {
  it('stamps a camelCase segmentId alongside the raw segment_id', () => {
    const colored = colorSegments(geoSegments([{ segment_id: 3 }]), undefined)

    // Regression: the map's click handler reads properties.segmentId — if
    // this function only ever produced segment_id (snake_case, from the
    // raw geo feature), every click on the map silently no-ops.
    expect(colored.features[0].properties?.segmentId).toBe(3)
    expect(colored.features[0].properties?.segment_id).toBe(3)
  })

  it('defaults status to not_assigned when no status map entry exists', () => {
    const colored = colorSegments(geoSegments([{ segment_id: 0 }]), undefined)
    expect(colored.features[0].properties?.status).toBe('not_assigned')
  })

  it('reads status from the provided map by segment_id', () => {
    const statusBySegmentId = new Map([[0, 'searched' as const]])
    const colored = colorSegments(geoSegments([{ segment_id: 0 }]), statusBySegmentId)
    expect(colored.features[0].properties?.status).toBe('searched')
  })

  it('colors a non-searchable segment gray regardless of status', () => {
    const colored = colorSegments(geoSegments([{ segment_id: 0, searchable: false }]), undefined)
    expect(colored.features[0].properties?.color).toBe('#9ca3af')
  })
})
