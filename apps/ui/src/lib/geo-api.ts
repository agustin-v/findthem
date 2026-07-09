import type { FeatureCollection } from 'geojson'

// --- Types ---

export interface GenerateSegmentsRequest {
  center: { lat: number; lng: number }
  radius_km: number
  h3_resolution?: number
  resources?: { type: string; count: number }[]
}

export interface SegmentProperties {
  segment_id: number
  cell_count: number
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

// --- Error ---

export class GeoApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GeoApiError'
    this.status = status
  }
}

// --- Client ---

const GEO_API_URL = import.meta.env.VITE_GEO_API_URL ?? 'http://localhost:8000'

export async function generateSegments(
  request: GenerateSegmentsRequest,
  signal?: AbortSignal,
): Promise<SegmentsResponse> {
  const res = await fetch(`${GEO_API_URL}/api/v1/segments/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new GeoApiError(text, res.status)
  }

  return res.json() as Promise<SegmentsResponse>
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${GEO_API_URL}/health`)
    if (!res.ok) return false
    const data = await res.json()
    return data.status === 'ok'
  } catch {
    return false
  }
}
