import type { FeatureCollection, Polygon } from 'geojson';
import {
  getDecayLevel,
  getSegmentColor,
  segmentsToGeoJSON,
  SEGMENT_STATUS_CYCLE,
  SEGMENT_COLORS,
  UNSEARCHABLE_COLOR,
  type SegmentProperties,
  type SegmentStatusInfo,
} from './segments';

describe('getDecayLevel', () => {
  it('returns fresh for < 1 hour', () => {
    expect(getDecayLevel(Date.now() - 0.5 * 3_600_000)).toBe('fresh');
  });

  it('returns aging for 1-2 hours', () => {
    expect(getDecayLevel(Date.now() - 1.5 * 3_600_000)).toBe('aging');
  });

  it('returns stale for 2-4 hours', () => {
    expect(getDecayLevel(Date.now() - 3 * 3_600_000)).toBe('stale');
  });

  it('returns expired for 4+ hours', () => {
    expect(getDecayLevel(Date.now() - 5 * 3_600_000)).toBe('expired');
  });
});

describe('getSegmentColor', () => {
  it('returns grey for not_assigned', () => {
    expect(getSegmentColor({ status: 'not_assigned' })).toBe(SEGMENT_COLORS.not_assigned);
  });

  it('returns blue for assigned', () => {
    expect(getSegmentColor({ status: 'assigned' })).toBe(SEGMENT_COLORS.assigned);
  });

  it('returns purple for in_progress', () => {
    expect(getSegmentColor({ status: 'in_progress' })).toBe(SEGMENT_COLORS.in_progress);
  });

  it('returns decay color for searched segments', () => {
    const searchedAt = Date.now() - 0.5 * 3_600_000;
    expect(getSegmentColor({ status: 'searched', searchedAt })).toBe(SEGMENT_COLORS.fresh);
  });
});

function geoSegments(
  features: { segmentId: number; searchable?: boolean }[],
): FeatureCollection<Polygon, SegmentProperties> {
  return {
    type: 'FeatureCollection',
    features: features.map(({ segmentId, searchable }) => ({
      type: 'Feature',
      properties: { segment_id: segmentId, searchable },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    })),
  };
}

describe('segmentsToGeoJSON', () => {
  it('produces a FeatureCollection with one feature per geo segment', () => {
    const geojson = segmentsToGeoJSON(geoSegments([{ segmentId: 0 }, { segmentId: 1 }]), []);

    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(2);
  });

  it('joins each feature to its status by segment_id', () => {
    const statuses: SegmentStatusInfo[] = [{ segmentId: 1, status: 'searched', searchedAt: Date.now() }];
    const geojson = segmentsToGeoJSON(geoSegments([{ segmentId: 0 }, { segmentId: 1 }]), statuses);

    const zero = geojson.features.find((f) => f.properties?.segmentId === 0);
    const one = geojson.features.find((f) => f.properties?.segmentId === 1);
    expect(zero?.properties?.status).toBe('not_assigned');
    expect(one?.properties?.status).toBe('searched');
  });

  it('defaults a segment with no status row yet to not_assigned instead of dropping it', () => {
    const geojson = segmentsToGeoJSON(geoSegments([{ segmentId: 5 }]), []);

    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].properties?.status).toBe('not_assigned');
  });

  it('colors a non-searchable segment gray regardless of status', () => {
    const statuses: SegmentStatusInfo[] = [{ segmentId: 0, status: 'searched', searchedAt: Date.now() }];
    const geojson = segmentsToGeoJSON(geoSegments([{ segmentId: 0, searchable: false }]), statuses);

    expect(geojson.features[0].properties?.color).toBe(UNSEARCHABLE_COLOR);
    expect(geojson.features[0].properties?.searchable).toBe(false);
  });

  it('defaults assignedToMe to false when no mySegmentIds are given', () => {
    const geojson = segmentsToGeoJSON(geoSegments([{ segmentId: 0 }]), []);
    expect(geojson.features[0].properties?.assignedToMe).toBe(false);
  });

  it('marks only the segments listed in mySegmentIds as assignedToMe', () => {
    const geojson = segmentsToGeoJSON(
      geoSegments([{ segmentId: 0 }, { segmentId: 1 }]),
      [],
      [1],
    );

    const zero = geojson.features.find((f) => f.properties?.segmentId === 0);
    const one = geojson.features.find((f) => f.properties?.segmentId === 1);
    expect(zero?.properties?.assignedToMe).toBe(false);
    expect(one?.properties?.assignedToMe).toBe(true);
  });

  it('defaults locked to false when no status row yet exists', () => {
    const geojson = segmentsToGeoJSON(geoSegments([{ segmentId: 0 }]), []);
    expect(geojson.features[0].properties?.locked).toBe(false);
  });

  it('stamps locked from the status row', () => {
    const statuses: SegmentStatusInfo[] = [
      { segmentId: 0, status: 'in_progress', locked: true, lockedForMe: false, lockReason: 'bridge is out' },
    ];
    const geojson = segmentsToGeoJSON(geoSegments([{ segmentId: 0 }]), statuses);
    expect(geojson.features[0].properties?.locked).toBe(true);
  });

  it('preserves each feature geometry unchanged', () => {
    const geojson = segmentsToGeoJSON(geoSegments([{ segmentId: 0 }]), []);
    expect(geojson.features[0].geometry).toEqual({
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    });
  });
});

describe('SEGMENT_STATUS_CYCLE', () => {
  it('cycles through all statuses', () => {
    expect(SEGMENT_STATUS_CYCLE.not_assigned).toBe('assigned');
    expect(SEGMENT_STATUS_CYCLE.assigned).toBe('in_progress');
    expect(SEGMENT_STATUS_CYCLE.in_progress).toBe('searched');
    expect(SEGMENT_STATUS_CYCLE.searched).toBe('not_assigned');
  });
});
