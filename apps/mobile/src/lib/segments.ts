import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

// Mirrors apps/api/lib/findthem_api/searches/segment.ex's status enum.
export type SegmentStatus = 'not_assigned' | 'assigned' | 'in_progress' | 'searched';

export const SEGMENT_STATUS_CYCLE: Record<SegmentStatus, SegmentStatus> = {
  not_assigned: 'assigned',
  assigned: 'in_progress',
  in_progress: 'searched',
  searched: 'not_assigned',
};

export type DecayLevel = 'fresh' | 'aging' | 'stale' | 'expired';

export interface SegmentStatusInfo {
  segmentId: number;
  status: SegmentStatus;
  searchedAt?: number;
  // Story #52/#56 — reduced volunteer-facing lock shape (never a raw
  // user/volunteer id), mirrors VolunteerSegment in lib/api.ts.
  locked?: boolean;
  lockedForMe?: boolean;
  lockReason?: string | null;
}

export interface SegmentProperties {
  segment_id: number;
  assigned_resource_type?: string | null;
  searchable?: boolean;
  [key: string]: unknown;
}

export const SEGMENT_COLORS = {
  not_assigned: '#6b7280',
  assigned: '#3b82f6',
  in_progress: '#8b5cf6',
  fresh: '#16a34a',
  aging: '#facc15',
  stale: '#f97316',
  expired: '#dc2626',
} as const;

// Non-searchable segments (restricted areas / sub-minimum slivers) are
// inert, not assignments — render them gray so they can't masquerade as a
// real status. Mirrors apps/ui/src/hooks/useSegmentLayer.ts.
export const UNSEARCHABLE_COLOR = '#9ca3af';

export const SEGMENT_FILL_OPACITY = 0.25;
export const SEGMENT_LINE_OPACITY = 0.8;

export function getDecayLevel(searchedAt: number): DecayLevel {
  const hoursAgo = (Date.now() - searchedAt) / 3_600_000;
  if (hoursAgo < 1) return 'fresh';
  if (hoursAgo < 2) return 'aging';
  if (hoursAgo < 4) return 'stale';
  return 'expired';
}

export function getSegmentColor(segment: { status: SegmentStatus; searchedAt?: number }): string {
  if (segment.status !== 'searched') return SEGMENT_COLORS[segment.status];
  return SEGMENT_COLORS[getDecayLevel(segment.searchedAt!)];
}

// Merges apps/geo's own segment polygons (already real GeoJSON geometry —
// no H3 reconstruction needed, unlike the old per-cell zones) with each
// segment's status from apps/api, keyed by segment_id. A segment with no
// matching status row yet (e.g. a fresh generation the volunteer hasn't
// refreshed into view) falls back to not_assigned rather than being
// dropped, so the polygon still renders.
//
// mySegmentIds (from GET /volunteer/search's my_segment_ids) marks which
// segments this volunteer is coordinator-assigned to — this only drives a
// visual highlight, not access control. Every approved volunteer can still
// see and mark every segment in the search; assignment is a "start here"
// hint, not a restriction (a segment can have multiple resources assigned,
// e.g. a drone and a foot volunteer together).
export function segmentsToGeoJSON(
  geoSegments: FeatureCollection<Polygon | MultiPolygon, SegmentProperties>,
  statuses: SegmentStatusInfo[],
  mySegmentIds: number[] = [],
): FeatureCollection<Polygon | MultiPolygon> {
  const statusById = new Map(statuses.map((s) => [s.segmentId, s]));
  const mySegmentIdSet = new Set(mySegmentIds);

  const features: Feature<Polygon | MultiPolygon>[] = geoSegments.features.map((feature) => {
    const segmentId = feature.properties.segment_id;
    const info = statusById.get(segmentId);
    const searchable = feature.properties.searchable !== false;
    const status: SegmentStatus = info?.status ?? 'not_assigned';

    return {
      type: 'Feature',
      geometry: feature.geometry,
      properties: {
        segmentId,
        status,
        searchable,
        assignedToMe: mySegmentIdSet.has(segmentId),
        locked: info?.locked ?? false,
        color: searchable ? getSegmentColor({ status, searchedAt: info?.searchedAt }) : UNSEARCHABLE_COLOR,
      },
    };
  });

  return { type: 'FeatureCollection', features };
}
