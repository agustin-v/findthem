import type { FeatureCollection } from 'geojson'

export const mockSegmentsResponse = {
  segments: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          segment_id: 0,
          cell_count: 5,
          cells: ['891f1d48177ffff', '891f1d48178ffff'],
          total_area_km2: 0.42,
          effective_area_km2: 0.38,
          workload: 0.38,
          assigned_resource_type: null,
          road_density: 0.0,
          vehicle_accessible: false,
          searchable: true,
          estimated_hours: 0.076,
          priority: 1,
          lkp_distance_km: 0.52,
          entry_point: [12.495, 41.905],
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [12.49, 41.90],
              [12.50, 41.90],
              [12.50, 41.91],
              [12.49, 41.91],
              [12.49, 41.90],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: {
          segment_id: 1,
          cell_count: 4,
          cells: ['891f1d4816bffff'],
          total_area_km2: 0.35,
          effective_area_km2: 0.30,
          workload: 0.30,
          assigned_resource_type: null,
          road_density: 0.0,
          vehicle_accessible: false,
          searchable: true,
          estimated_hours: 0.06,
          priority: 2,
          lkp_distance_km: 0.81,
          entry_point: [12.505, 41.905],
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [12.50, 41.90],
              [12.51, 41.90],
              [12.51, 41.91],
              [12.50, 41.91],
              [12.50, 41.90],
            ],
          ],
        },
      },
    ],
  } satisfies FeatureCollection,
  restricted_areas: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          name: 'Military Zone Alpha',
          restriction_type: 'military',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [12.495, 41.905],
              [12.500, 41.905],
              [12.500, 41.908],
              [12.495, 41.908],
              [12.495, 41.905],
            ],
          ],
        },
      },
    ],
  } satisfies FeatureCollection,
  meta: {
    center: { lat: 41.9028, lng: 12.4964 },
    radius_km: 1.5,
    h3_resolution: 9,
    total_cells: 3,
    total_segments: 2,
    restricted_areas_count: 1,
  },
}

export const mockSearchDetail = {
  id: '1',
  subjectType: 'person' as const,
  subjectName: 'Marco Rossi',
  status: 'active' as const,
  createdAt: new Date(Date.now() - 3600000 * 2),
  volunteerCount: 4,
  segmentsSearched: 3,
  totalSegments: 19,
  lastSeenLocation: 'Via del Corso 12, Roma',
  lastSeenAt: '2026-05-07T14:30:00Z',
  lastSeenCoords: { lat: 41.9028, lng: 12.4964 },
  details: {
    age: '72',
    physicalDescription: '175cm, grey hair, brown eyes',
    healthNotes: 'Mild dementia',
    phone: '+39 06 1234567',
  },
}
