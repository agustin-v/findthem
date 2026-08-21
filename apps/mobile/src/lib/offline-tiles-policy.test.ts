import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { boundsFromGeoJSON, estimateTileCount, MAX_DOWNLOADABLE_TILES } from './offline-tiles-policy';

function polygonFeatureCollection(rings: [number, number][][]): FeatureCollection<Polygon | MultiPolygon> {
  return {
    type: 'FeatureCollection',
    features: rings.map((ring) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [ring] },
    })),
  };
}

describe('boundsFromGeoJSON', () => {
  it('returns null for an empty FeatureCollection', () => {
    expect(boundsFromGeoJSON({ type: 'FeatureCollection', features: [] })).toBeNull();
  });

  it('computes the exact bounding box with zero padding', () => {
    const fc = polygonFeatureCollection([
      [
        [12.4, 41.9],
        [12.5, 41.9],
        [12.5, 42.0],
        [12.4, 42.0],
        [12.4, 41.9],
      ],
    ]);

    const bounds = boundsFromGeoJSON(fc, 0);

    expect(bounds).toEqual([12.4, 41.9, 12.5, 42.0]);
  });

  it('pads the bounding box proportionally to its size', () => {
    const fc = polygonFeatureCollection([
      [
        [10, 40],
        [20, 40],
        [20, 50],
        [10, 50],
        [10, 40],
      ],
    ]);

    // 10 degrees wide/tall, 10% padding -> 1 degree pad on each side.
    const bounds = boundsFromGeoJSON(fc, 0.1);

    expect(bounds).toEqual([9, 39, 21, 51]);
  });

  it('covers every feature, not just the first', () => {
    const fc = polygonFeatureCollection([
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
      [
        [10, 10],
        [11, 10],
        [11, 11],
        [10, 11],
        [10, 10],
      ],
    ]);

    const bounds = boundsFromGeoJSON(fc, 0);

    expect(bounds).toEqual([0, 0, 11, 11]);
  });

  it('handles a MultiPolygon feature', () => {
    const fc: FeatureCollection<Polygon | MultiPolygon> = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
              [
                [
                  [5, 5],
                  [6, 5],
                  [6, 6],
                  [5, 6],
                  [5, 5],
                ],
              ],
            ],
          },
        },
      ],
    };

    const bounds = boundsFromGeoJSON(fc, 0);

    expect(bounds).toEqual([0, 0, 6, 6]);
  });

  it('clamps padded bounds to valid longitude/latitude ranges', () => {
    const fc = polygonFeatureCollection([
      [
        [-179.9, -84.9],
        [179.9, -84.9],
        [179.9, 84.9],
        [-179.9, 84.9],
        [-179.9, -84.9],
      ],
    ]);

    const bounds = boundsFromGeoJSON(fc, 0.5);

    expect(bounds![0]).toBeGreaterThanOrEqual(-180);
    expect(bounds![1]).toBeGreaterThanOrEqual(-85);
    expect(bounds![2]).toBeLessThanOrEqual(180);
    expect(bounds![3]).toBeLessThanOrEqual(85);
  });
});

describe('estimateTileCount', () => {
  it('returns exactly 1 tile for a single-point bounds at a single zoom level', () => {
    // A degenerate (zero-area) bounds still resolves to exactly one tile
    // at any given zoom — same point falls in the same tile on all sides.
    expect(estimateTileCount([12.4964, 41.9028, 12.4964, 41.9028], 10, 10)).toBe(1);
  });

  it('sums tile counts across the full zoom range, not just one level', () => {
    const singleLevel = estimateTileCount([12.4, 41.9, 12.5, 42.0], 14, 14);
    const twoLevels = estimateTileCount([12.4, 41.9, 12.5, 42.0], 14, 15);

    // Level 15 covers at least as many tiles as level 14 for the same
    // bounds (finer grid), so the two-level sum must exceed the single
    // level's own count.
    expect(twoLevels).toBeGreaterThan(singleLevel);
  });

  it('a larger bounding box produces a larger estimate at the same zoom', () => {
    const small = estimateTileCount([12.4, 41.9, 12.5, 42.0], 15, 15);
    const large = estimateTileCount([12.0, 41.5, 13.0, 42.5], 15, 15);

    expect(large).toBeGreaterThan(small);
  });

  it('a city-sized area at the default zoom range stays within the downloadable cap', () => {
    // Roughly a 1.5km-radius search area (matches this app's own default
    // search radius) — should comfortably fit under the 6,000-tile limit.
    const bounds: [number, number, number, number] = [12.485, 41.895, 12.508, 41.911];
    expect(estimateTileCount(bounds)).toBeLessThan(MAX_DOWNLOADABLE_TILES);
  });

  it('a very large area at the default zoom range exceeds the downloadable cap', () => {
    // A ~100km-wide box — the "too large to download offline" path this
    // story explicitly asks for should be reachable.
    const bounds: [number, number, number, number] = [11.5, 41.0, 13.5, 43.0];
    expect(estimateTileCount(bounds)).toBeGreaterThan(MAX_DOWNLOADABLE_TILES);
  });
});
