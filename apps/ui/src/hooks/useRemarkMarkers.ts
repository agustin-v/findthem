import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import type { Remark } from '@/lib/api'

const KIND_COLOR: Record<string, string> = {
  sighting: '#3b82f6',
  hazard: '#dc2626',
  note: '#6b7280',
}

const KIND_SYMBOL: Record<string, string> = {
  sighting: '\u{1F441}', // eye
  hazard: '⚠', // warning triangle
  note: '\u{1F4DD}', // memo
}

function buildPopupContent(remark: Remark): HTMLDivElement {
  // Built with textContent throughout (never innerHTML/setHTML) — remark
  // text is attacker-controllable (any coordinator or volunteer on the
  // search can author one), and this renders directly into the DOM of
  // every other connected client's map.
  const container = document.createElement('div')
  container.style.fontSize = '13px'
  container.style.maxWidth = '220px'

  const kindEl = document.createElement('strong')
  kindEl.style.textTransform = 'capitalize'
  kindEl.textContent = remark.kind
  container.appendChild(kindEl)

  if (remark.text) {
    const textEl = document.createElement('div')
    textEl.style.marginTop = '2px'
    textEl.textContent = remark.text
    container.appendChild(textEl)
  }

  const timeEl = document.createElement('div')
  timeEl.style.color = '#78736A'
  timeEl.style.fontSize = '11px'
  timeEl.style.marginTop = '4px'
  timeEl.textContent = new Date(remark.reportedAt).toLocaleString()
  container.appendChild(timeEl)

  return container
}

function buildMarkerElement(remark: Remark): HTMLDivElement {
  const el = document.createElement('div')
  el.style.width = '28px'
  el.style.height = '28px'
  el.style.borderRadius = '999px'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.fontSize = '14px'
  el.style.lineHeight = '1'
  el.style.backgroundColor = KIND_COLOR[remark.kind] ?? '#6b7280'
  el.style.border = '2px solid white'
  el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.35)'
  el.style.cursor = 'pointer'
  el.textContent = KIND_SYMBOL[remark.kind] ?? '\u{1F4CD}'
  return el
}

interface UseRemarkMarkersOptions {
  map: maplibregl.Map | null
  remarks: Remark[]
}

// Plain maplibregl.Marker instances, not a GeoJSONSource+Layer like
// useSegmentLayer/useRestrictedAreaLayer — remarks are sparse points that
// each want their own click-to-popup affordance, matching the LKP marker
// SearchDetailPage already places this same way, not a shaded area.
export function useRemarkMarkers({ map, remarks }: UseRemarkMarkersOptions) {
  const markersRef = useRef(new Map<string, maplibregl.Marker>())

  useEffect(() => {
    if (!map) return

    // Only remarks with a real position render — some volunteer-authored
    // ones won't have one (GPS denied/failed), same as the mobile app.
    const withPosition = remarks.filter(
      (r): r is Remark & { lat: number; lng: number } => r.lat != null && r.lng != null,
    )
    const currentIds = new Set(withPosition.map((r) => r.id))

    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    }

    for (const remark of withPosition) {
      if (markersRef.current.has(remark.id)) continue

      const popup = new maplibregl.Popup({ offset: 18, closeButton: true }).setDOMContent(
        buildPopupContent(remark),
      )

      const marker = new maplibregl.Marker({ element: buildMarkerElement(remark) })
        .setLngLat([remark.lng, remark.lat])
        .setPopup(popup)
        .addTo(map)

      markersRef.current.set(remark.id, marker)
    }
  }, [map, remarks])

  useEffect(() => {
    const markers = markersRef.current
    return () => {
      for (const marker of markers.values()) marker.remove()
      markers.clear()
    }
  }, [])
}
