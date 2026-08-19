import { renderHook } from '@testing-library/react'
import type { Remark } from '@/lib/api'
import { useRemarkMarkers } from './useRemarkMarkers'

const addToCalls: unknown[] = []
const removeCalls: string[] = []

vi.mock('maplibre-gl', () => {
  class FakePopup {
    setDOMContent() {
      return this
    }
  }
  class FakeMarker {
    private id: string
    constructor({ element }: { element: HTMLElement }) {
      this.id = element.textContent ?? ''
    }
    setLngLat() {
      return this
    }
    setPopup() {
      return this
    }
    addTo(map: unknown) {
      addToCalls.push(map)
      return this
    }
    remove() {
      removeCalls.push(this.id)
    }
  }
  return { default: { Marker: FakeMarker, Popup: FakePopup } }
})

function remark(id: string): Remark {
  return {
    id,
    searchId: 'search-1',
    volunteerId: null,
    kind: 'sighting',
    text: null,
    lat: 41.9,
    lng: 12.5,
    reportedAt: new Date().toISOString(),
    insertedAt: new Date().toISOString(),
  }
}

describe('useRemarkMarkers', () => {
  beforeEach(() => {
    addToCalls.length = 0
    removeCalls.length = 0
  })

  it('adds a marker for each remark with a position', () => {
    const map = {} as never
    renderHook(() => useRemarkMarkers({ map, remarks: [remark('r1'), remark('r2')] }))

    expect(addToCalls).toEqual([map, map])
  })

  it('skips remarks with no lat/lng', () => {
    const map = {} as never
    const noPosition: Remark = { ...remark('r1'), lat: null, lng: null }
    renderHook(() => useRemarkMarkers({ map, remarks: [noPosition] }))

    expect(addToCalls).toEqual([])
  })

  // Regression: SearchDetailPage unmounts/remounts MapView (a new
  // maplibregl.Map instance) on a Map -> other-tab -> Map round trip. The
  // hook's dedupe-by-id tracking must not survive that swap, or every
  // remark silently stops being re-added to the new map forever.
  it('re-adds every marker when the map instance changes, even for remark ids already seen', () => {
    const mapA = { id: 'a' } as never
    const remarks = [remark('r1'), remark('r2')]

    const { rerender } = renderHook(
      ({ map }) => useRemarkMarkers({ map, remarks }),
      { initialProps: { map: mapA } },
    )
    expect(addToCalls).toEqual([mapA, mapA])

    const mapB = { id: 'b' } as never
    rerender({ map: mapB })

    expect(addToCalls).toEqual([mapA, mapA, mapB, mapB])
  })
})
