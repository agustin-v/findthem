import { cellToBoundary } from 'h3-js'
import type { Feature, FeatureCollection, Polygon } from 'geojson'

export type ZoneStatus = 'not_assigned' | 'assigned' | 'in_progress' | 'searched'

export const ZONE_STATUS_CYCLE: Record<ZoneStatus, ZoneStatus> = {
  not_assigned: 'assigned',
  assigned: 'in_progress',
  in_progress: 'searched',
  searched: 'not_assigned',
}

export type DecayLevel = 'fresh' | 'aging' | 'stale' | 'expired'

export interface Zone {
  h3Index: string
  status: ZoneStatus
  searchedAt?: number
  assignedTo?: string
}

export interface ZonesResponse {
  searchId: string
  zones: Zone[]
}

export const ZONE_COLORS = {
  not_assigned: '#6b7280',
  assigned: '#3b82f6',
  in_progress: '#8b5cf6',
  fresh: '#16a34a',
  aging: '#facc15',
  stale: '#f97316',
  expired: '#dc2626',
} as const

export const ZONE_FILL_OPACITY = 0.25
export const ZONE_LINE_OPACITY = 0.8

export function getDecayLevel(searchedAt: number): DecayLevel {
  const hoursAgo = (Date.now() - searchedAt) / 3_600_000
  if (hoursAgo < 1) return 'fresh'
  if (hoursAgo < 2) return 'aging'
  if (hoursAgo < 4) return 'stale'
  return 'expired'
}

export function getZoneColor(zone: Zone): string {
  if (zone.status !== 'searched') return ZONE_COLORS[zone.status]
  return ZONE_COLORS[getDecayLevel(zone.searchedAt!)]
}

// --- GeoJSON conversion ---

export function zonesToGeoJSON(zones: Zone[]): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = []

  for (const zone of zones) {
    // Defense in depth: the backend validates h3_index format server-side,
    // but this must never trust that fully — cellToBoundary throws on a
    // malformed index. A skipped zone is far better than a crashed map.
    let boundary: ReturnType<typeof cellToBoundary>
    try {
      boundary = cellToBoundary(zone.h3Index, true) // [lng, lat] mode
    } catch {
      console.warn(`Skipping zone with invalid h3Index: ${zone.h3Index}`)
      continue
    }

    const ring = [...boundary, boundary[0]] // close the ring

    features.push({
      type: 'Feature',
      properties: {
        h3Index: zone.h3Index,
        status: zone.status,
        color: getZoneColor(zone),
      },
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
    })
  }

  return { type: 'FeatureCollection', features }
}
