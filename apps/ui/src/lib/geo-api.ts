import type { FeatureCollection } from 'geojson'

// Types-only — the browser never talks to apps/geo directly (Story 16).
// Segment generation is proxied through apps/api's POST
// /api/searches/:id/generate (see lib/api.ts's api.searches.generate),
// which is also the only place that ever needs include_cells: true (to
// seed apps/api's zones table server-side).

export interface GenerateSegmentsRequest {
  center: { lat: number; lng: number }
  radius_km: number
  h3_resolution?: number
  resources?: { type: string; count: number }[]
  include_cells?: boolean
}

export interface SegmentProperties {
  segment_id: number
  cell_count: number
  // Only present when the request set include_cells: true.
  cells?: string[]
  total_area_km2: number
  effective_area_km2: number
  workload: number
  assigned_resource_type: string | null
  road_density: number
  vehicle_accessible: boolean
  searchable: boolean
  estimated_hours: number
  priority: number
  lkp_distance_km: number
  entry_point: [number, number] | null
}

export interface RestrictedAreaProperties {
  name: string
  restriction_type: 'military' | 'prison' | 'aerodrome' | 'private'
}

export interface SegmentsMeta {
  center: { lat: number; lng: number }
  radius_km: number
  h3_resolution: number
  total_cells: number
  total_segments: number
  restricted_areas_count: number
  resource_assignment?: Record<string, number>
}

export interface SegmentsResponse {
  segments: FeatureCollection
  restricted_areas: FeatureCollection
  meta: SegmentsMeta
}
