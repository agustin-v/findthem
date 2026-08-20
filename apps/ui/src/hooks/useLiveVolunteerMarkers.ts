import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import type { Volunteer, VolunteerLocation } from '@/lib/api'

const DOT_COLOR = '#2563eb'
const DOT_COLOR_SELECTED = '#1d4ed8'

function buildMarkerElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.display = 'flex'
  el.style.flexDirection = 'column'
  el.style.alignItems = 'center'
  el.style.gap = '2px'
  el.style.cursor = 'pointer'
  el.setAttribute('role', 'button')
  el.tabIndex = 0

  const dot = document.createElement('div')
  dot.dataset.role = 'dot'
  dot.style.width = '16px'
  dot.style.height = '16px'
  dot.style.borderRadius = '999px'
  dot.style.boxShadow = '0 1px 4px rgba(0,0,0,0.35)'
  el.appendChild(dot)

  const label = document.createElement('div')
  label.dataset.role = 'label'
  label.style.fontSize = '11px'
  label.style.fontWeight = '600'
  label.style.lineHeight = '1'
  label.style.color = 'white'
  label.style.backgroundColor = 'rgba(0,0,0,0.6)'
  label.style.padding = '2px 6px'
  label.style.borderRadius = '999px'
  label.style.whiteSpace = 'nowrap'
  label.style.maxWidth = '120px'
  label.style.overflow = 'hidden'
  label.style.textOverflow = 'ellipsis'
  el.appendChild(label)

  return el
}

// Mutates an existing marker element's content in place — used both when
// first building a marker and when a volunteer already has one (name or
// selection state changed, position didn't). Safe because it only ever
// touches this element's own children, never replaces the root node
// MapLibre's Marker keeps a reference to.
function applyMarkerContent(el: HTMLElement, volunteer: Volunteer, selected: boolean) {
  const dot = el.querySelector<HTMLElement>('[data-role="dot"]')
  if (dot) {
    dot.style.backgroundColor = selected ? DOT_COLOR_SELECTED : DOT_COLOR
    dot.style.border = selected ? '3px solid white' : '2px solid white'
  }

  const label = el.querySelector<HTMLElement>('[data-role="label"]')
  if (label) {
    // Attacker-controllable (a volunteer's own name) — textContent only.
    label.textContent = volunteer.name
  }

  el.setAttribute('aria-label', volunteer.name)
}

interface TrackedVolunteer extends Volunteer {
  lastLocation: VolunteerLocation
}

function trackedVolunteers(volunteers: Volunteer[]): TrackedVolunteer[] {
  return volunteers.filter(
    (v): v is TrackedVolunteer => v.status === 'approved' && v.consentLocation && v.lastLocation != null,
  )
}

interface UseLiveVolunteerMarkersOptions {
  map: maplibregl.Map | null
  volunteers: Volunteer[]
  selectedVolunteerId: string | null
  onSelectVolunteer: (volunteerId: string) => void
  // Suspended while true (no marker click fires) — mirrors
  // useSegmentLayer's onSegmentClick suspension while placing a remark: a
  // tap on a volunteer dot should place the pin, not open a trail.
  suppressClicks?: boolean
}

// One maplibregl.Marker per approved, consenting, currently-tracked
// volunteer — a dot + name label, clickable (and Enter/Space-able) to
// toggle that volunteer as the selected breadcrumb-trail subject. A
// volunteer with consentLocation: false, or no lastLocation yet, gets no
// marker at all — no position exists to place one at; VolunteerTable's
// LocationIndicator is where that state is visible instead.
//
// Keyed diffing (by volunteer id), not rebuild-everything — a search with
// many volunteers pinging on a timer would otherwise tear down and rebuild
// every marker's DOM on every single ping (each one invalidates the whole
// volunteers list), visibly flickering the dots and swallowing any click
// that lands mid-rebuild. An existing marker is repositioned via
// setLngLat and has its content updated in place instead. Tracks the
// bound map instance and clears without an explicit per-marker .remove()
// when it changes (same pattern as useRemarkMarkers) — SearchDetailPage
// nulls `map` itself before the old maplibregl.Map is destroyed
// (MapView's onMapDestroy), so by the time a new instance arrives here,
// the old markers' elements are already gone along with their container.
export function useLiveVolunteerMarkers({
  map,
  volunteers,
  selectedVolunteerId,
  onSelectVolunteer,
  suppressClicks = false,
}: UseLiveVolunteerMarkersOptions) {
  const markersRef = useRef(new Map<string, maplibregl.Marker>())
  const boundMapRef = useRef<maplibregl.Map | null>(null)
  // Read by the (stable, attached-once) click/keydown listeners so a
  // suppressClicks toggle doesn't require rebuilding every marker just to
  // rewire its handler. Updated in an effect, not during render — refs
  // are for event handlers/effects to read, not to write while rendering.
  const suppressClicksRef = useRef(suppressClicks)
  useEffect(() => {
    suppressClicksRef.current = suppressClicks
  }, [suppressClicks])
  const onSelectVolunteerRef = useRef(onSelectVolunteer)
  useEffect(() => {
    onSelectVolunteerRef.current = onSelectVolunteer
  }, [onSelectVolunteer])

  useEffect(() => {
    if (!map) return

    if (boundMapRef.current !== map) {
      markersRef.current.clear()
      boundMapRef.current = map
    }

    const tracked = trackedVolunteers(volunteers)
    const currentIds = new Set(tracked.map((v) => v.id))

    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    }

    for (const volunteer of tracked) {
      const selected = volunteer.id === selectedVolunteerId
      const existing = markersRef.current.get(volunteer.id)

      if (existing) {
        existing.setLngLat([volunteer.lastLocation.lng, volunteer.lastLocation.lat])
        applyMarkerContent(existing.getElement(), volunteer, selected)
        continue
      }

      const el = buildMarkerElement()
      applyMarkerContent(el, volunteer, selected)

      const select = (e: Event) => {
        e.stopPropagation()
        if (suppressClicksRef.current) return
        onSelectVolunteerRef.current(volunteer.id)
      }
      el.addEventListener('click', select)
      el.addEventListener('keydown', (e) => {
        if (e instanceof KeyboardEvent && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          select(e)
        }
      })

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([volunteer.lastLocation.lng, volunteer.lastLocation.lat])
        .addTo(map)

      markersRef.current.set(volunteer.id, marker)
    }
  }, [map, volunteers, selectedVolunteerId])

  useEffect(() => {
    // Captured once here, not read fresh inside the returned closure —
    // this Map is mutated in place (.set/.delete/.clear), never
    // reassigned, so the captured reference stays valid and current for
    // the component's whole lifetime. Same pattern as useRemarkMarkers'
    // identically-shaped cleanup.
    const markers = markersRef.current
    return () => {
      for (const marker of markers.values()) marker.remove()
      markers.clear()
    }
  }, [])
}
