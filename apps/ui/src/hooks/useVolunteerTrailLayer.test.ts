import { renderHook } from '@testing-library/react'
import type maplibregl from 'maplibre-gl'
import type { VolunteerLocation } from '@/lib/api'
import { useVolunteerTrailLayer } from './useVolunteerTrailLayer'

function fakeMap() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = new Set<string>()

  return {
    addSource: vi.fn((id: string, spec: unknown) => {
      void spec
      sources.set(id, { setData: vi.fn() })
    }),
    getSource: vi.fn((id: string) => sources.get(id)),
    addLayer: vi.fn((layer: { id: string }) => {
      layers.add(layer.id)
    }),
    getLayer: vi.fn((id: string) => (layers.has(id) ? {} : undefined)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    _sources: sources,
  }
}

type FakeMap = ReturnType<typeof fakeMap>

function asMap(map: FakeMap): maplibregl.Map {
  return map as unknown as maplibregl.Map
}

function point(overrides: Partial<VolunteerLocation> = {}): VolunteerLocation {
  return { lat: 41.9, lng: 12.5, recordedAt: '2026-08-20T10:00:00Z', ...overrides }
}

describe('useVolunteerTrailLayer', () => {
  it('adds no source or layer when trail is null', () => {
    const map = fakeMap()
    renderHook(() => useVolunteerTrailLayer({ map: asMap(map), trail: null }))

    expect(map.addSource).not.toHaveBeenCalled()
    expect(map.addLayer).not.toHaveBeenCalled()
  })

  it('adds no source or layer for an empty trail', () => {
    const map = fakeMap()
    renderHook(() => useVolunteerTrailLayer({ map: asMap(map), trail: [] }))

    expect(map.addSource).not.toHaveBeenCalled()
  })

  // Deferred creation (not added unconditionally on map-ready) is
  // deliberate — see the hook's own comment on why: avoids a load-order
  // race against useSegmentLayer's asynchronously-added segment fill,
  // which has no beforeId either.
  it('adds the source and both layers on the first non-empty trail', () => {
    const map = fakeMap()
    renderHook(() => useVolunteerTrailLayer({ map: asMap(map), trail: [point()] }))

    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.addLayer).toHaveBeenCalledTimes(2)
  })

  it('calls setData on the existing source for a subsequent trail change, not addSource again', () => {
    const map = fakeMap()
    const { rerender } = renderHook(
      ({ trail }: { trail: VolunteerLocation[] | null }) =>
        useVolunteerTrailLayer({ map: asMap(map), trail }),
      { initialProps: { trail: [point()] } },
    )
    expect(map.addSource).toHaveBeenCalledTimes(1)

    rerender({ trail: [point(), point({ lat: 41.91 })] })

    expect(map.addSource).toHaveBeenCalledTimes(1)
    const source = map._sources.get('volunteer-trail')!
    expect(source.setData).toHaveBeenCalledTimes(1)
  })

  it('clears the source data when trail transitions from present to null', () => {
    const map = fakeMap()
    const { rerender } = renderHook(
      ({ trail }: { trail: VolunteerLocation[] | null }) =>
        useVolunteerTrailLayer({ map: asMap(map), trail }),
      { initialProps: { trail: [point()] as VolunteerLocation[] | null } },
    )
    const source = map._sources.get('volunteer-trail')!

    rerender({ trail: null })

    expect(source.setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] })
  })

  it('does not throw and produces only a point feature for a single-ping trail', () => {
    const map = fakeMap()
    expect(() =>
      renderHook(() => useVolunteerTrailLayer({ map: asMap(map), trail: [point()] })),
    ).not.toThrow()

    const call = map.addSource.mock.calls[0][1] as { data: GeoJSON.FeatureCollection }
    expect(call.data.features).toHaveLength(1)
    expect(call.data.features[0].geometry.type).toBe('Point')
  })

  it('produces a LineString plus one point per ping for a multi-point trail', () => {
    const map = fakeMap()
    renderHook(() =>
      useVolunteerTrailLayer({
        map: asMap(map),
        trail: [point(), point({ lat: 41.91 }), point({ lat: 41.92 })],
      }),
    )

    const call = map.addSource.mock.calls[0][1] as { data: GeoJSON.FeatureCollection }
    const geometryTypes = call.data.features.map((f) => f.geometry.type)
    expect(geometryTypes).toEqual(['LineString', 'Point', 'Point', 'Point'])
  })

  it('removes the layers and source on unmount', () => {
    const map = fakeMap()
    const { unmount } = renderHook(() => useVolunteerTrailLayer({ map: asMap(map), trail: [point()] }))

    unmount()

    expect(map.removeLayer).toHaveBeenCalledWith('volunteer-trail-line')
    expect(map.removeLayer).toHaveBeenCalledWith('volunteer-trail-points')
    expect(map.removeSource).toHaveBeenCalledWith('volunteer-trail')
  })
})
