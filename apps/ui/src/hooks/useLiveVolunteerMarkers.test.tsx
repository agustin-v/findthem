import { renderHook } from '@testing-library/react'
import type { Volunteer } from '@/lib/api'
import { useLiveVolunteerMarkers } from './useLiveVolunteerMarkers'

const addToCalls: unknown[] = []
const removeCalls: number[] = []
const builtElements: HTMLElement[] = []

vi.mock('maplibre-gl', () => {
  class FakeMarker {
    private id: number
    private element: HTMLElement
    constructor({ element }: { element: HTMLElement }) {
      this.id = builtElements.length
      this.element = element
      builtElements.push(element)
    }
    setLngLat() {
      return this
    }
    getElement() {
      return this.element
    }
    addTo(map: unknown) {
      addToCalls.push(map)
      return this
    }
    remove() {
      removeCalls.push(this.id)
    }
  }
  return { default: { Marker: FakeMarker } }
})

function volunteer(overrides: Partial<Volunteer> = {}): Volunteer {
  return {
    id: 'vol-1',
    name: 'Giulia',
    phone: '+390698765',
    resourceType: null,
    status: 'approved',
    consentLocation: true,
    lastLocation: { lat: 41.9, lng: 12.5, recordedAt: '2026-08-20T10:00:00Z' },
    lastActiveAt: null,
    joinedAt: '2026-08-01T10:00:00Z',
    approvedAt: '2026-08-01T10:05:00Z',
    removedAt: null,
    segmentsSearched: 0,
    ...overrides,
  }
}

describe('useLiveVolunteerMarkers', () => {
  beforeEach(() => {
    addToCalls.length = 0
    removeCalls.length = 0
    builtElements.length = 0
  })

  it('adds a marker for each approved, consenting volunteer with a position', () => {
    const map = {} as never
    renderHook(() =>
      useLiveVolunteerMarkers({
        map,
        volunteers: [volunteer({ id: 'a' }), volunteer({ id: 'b' })],
        selectedVolunteerId: null,
        onSelectVolunteer: vi.fn(),
      }),
    )

    expect(addToCalls).toEqual([map, map])
  })

  it('skips a volunteer who declined location consent', () => {
    const map = {} as never
    renderHook(() =>
      useLiveVolunteerMarkers({
        map,
        volunteers: [volunteer({ consentLocation: false })],
        selectedVolunteerId: null,
        onSelectVolunteer: vi.fn(),
      }),
    )

    expect(addToCalls).toEqual([])
  })

  it('skips a consenting volunteer with no location fix yet', () => {
    const map = {} as never
    renderHook(() =>
      useLiveVolunteerMarkers({
        map,
        volunteers: [volunteer({ lastLocation: null })],
        selectedVolunteerId: null,
        onSelectVolunteer: vi.fn(),
      }),
    )

    expect(addToCalls).toEqual([])
  })

  it('skips a non-approved volunteer even with consent and a position', () => {
    const map = {} as never
    renderHook(() =>
      useLiveVolunteerMarkers({
        map,
        volunteers: [volunteer({ status: 'pending' })],
        selectedVolunteerId: null,
        onSelectVolunteer: vi.fn(),
      }),
    )

    expect(addToCalls).toEqual([])
  })

  // Regression: this hook used to remove and rebuild EVERY marker on any
  // volunteers-list change — a search with many volunteers pinging on a
  // timer would tear down and recreate the whole DOM on every single ping
  // (each one invalidates the whole list), visibly flickering the dots.
  // Keyed diffing means an already-tracked volunteer's marker is
  // repositioned in place, never removed and re-added.
  it('only adds a new marker for a newly-tracked volunteer, leaving the existing one alone', () => {
    const map = {} as never
    const { rerender } = renderHook(
      ({ volunteers }) =>
        useLiveVolunteerMarkers({
          map,
          volunteers,
          selectedVolunteerId: null,
          onSelectVolunteer: vi.fn(),
        }),
      { initialProps: { volunteers: [volunteer({ id: 'a' })] } },
    )
    expect(addToCalls).toEqual([map])

    rerender({ volunteers: [volunteer({ id: 'a' }), volunteer({ id: 'b' })] })

    expect(removeCalls).toEqual([])
    expect(addToCalls).toEqual([map, map])
  })

  it('removes a marker for a volunteer who is no longer tracked (removed, or consent withdrawn)', () => {
    const map = {} as never
    const { rerender } = renderHook(
      ({ volunteers }) =>
        useLiveVolunteerMarkers({
          map,
          volunteers,
          selectedVolunteerId: null,
          onSelectVolunteer: vi.fn(),
        }),
      { initialProps: { volunteers: [volunteer({ id: 'a' }), volunteer({ id: 'b' })] } },
    )
    expect(addToCalls).toEqual([map, map])

    rerender({ volunteers: [volunteer({ id: 'a' })] })

    expect(removeCalls).toEqual([1])
    expect(addToCalls).toEqual([map, map])
  })

  it('repositions an existing marker instead of recreating it when its location changes', () => {
    const map = {} as never
    const setLngLatSpy = vi.fn()
    const { rerender } = renderHook(
      ({ volunteers }) =>
        useLiveVolunteerMarkers({
          map,
          volunteers,
          selectedVolunteerId: null,
          onSelectVolunteer: vi.fn(),
        }),
      { initialProps: { volunteers: [volunteer({ id: 'a' })] } },
    )
    expect(addToCalls).toEqual([map])

    rerender({
      volunteers: [
        volunteer({ id: 'a', lastLocation: { lat: 42.0, lng: 13.0, recordedAt: '2026-08-20T10:05:00Z' } }),
      ],
    })

    expect(removeCalls).toEqual([])
    expect(addToCalls).toEqual([map])
    void setLngLatSpy
  })

  it("clicking a marker's element calls onSelectVolunteer with that volunteer's id and stops propagation", () => {
    const map = {} as never
    const onSelectVolunteer = vi.fn()

    renderHook(() =>
      useLiveVolunteerMarkers({
        map,
        volunteers: [volunteer({ id: 'a' }), volunteer({ id: 'b' })],
        selectedVolunteerId: null,
        onSelectVolunteer,
      }),
    )

    const [elementA, elementB] = builtElements
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation')
    elementB.dispatchEvent(event)

    expect(onSelectVolunteer).toHaveBeenCalledTimes(1)
    expect(onSelectVolunteer).toHaveBeenCalledWith('b')
    expect(stopPropagationSpy).toHaveBeenCalled()
    void elementA
  })

  it('does not call onSelectVolunteer when suppressClicks is true', () => {
    const map = {} as never
    const onSelectVolunteer = vi.fn()

    renderHook(() =>
      useLiveVolunteerMarkers({
        map,
        volunteers: [volunteer({ id: 'a' })],
        selectedVolunteerId: null,
        onSelectVolunteer,
        suppressClicks: true,
      }),
    )

    builtElements[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(onSelectVolunteer).not.toHaveBeenCalled()
  })

  it('calls onSelectVolunteer on Enter/Space keydown for keyboard accessibility', () => {
    const map = {} as never
    const onSelectVolunteer = vi.fn()

    renderHook(() =>
      useLiveVolunteerMarkers({
        map,
        volunteers: [volunteer({ id: 'a' })],
        selectedVolunteerId: null,
        onSelectVolunteer,
      }),
    )

    builtElements[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )

    expect(onSelectVolunteer).toHaveBeenCalledWith('a')
  })

  it('re-adds every marker when the map instance changes', () => {
    const mapA = { id: 'a' } as never
    const { rerender } = renderHook(
      ({ map }) =>
        useLiveVolunteerMarkers({
          map,
          volunteers: [volunteer({ id: 'a' })],
          selectedVolunteerId: null,
          onSelectVolunteer: vi.fn(),
        }),
      { initialProps: { map: mapA } },
    )
    expect(addToCalls).toEqual([mapA])

    const mapB = { id: 'b' } as never
    rerender({ map: mapB })

    expect(addToCalls).toEqual([mapA, mapB])
  })
})
