import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

// Pure logic only — no @maplibre/maplibre-react-native import — so this
// stays importable from vitest, same split as every other policy/adapter
// pair in this app (outbox-policy.ts/outbox.ts, offline-cache-policy.ts/
// offline-cache.ts). offline-tiles.ts is the native-heavy, untested
// OfflineManager wrapper; this is where the actual math lives.

export type LngLatBounds = [west: number, south: number, east: number, north: number];

// Street-level detail (17) without going so fine the tile count explodes
// for anything but a very small search; regional context down to 12 so a
// volunteer can still see how their area sits relative to landmarks
// outside the search radius. Not configurable per search in v1 — a fixed,
// reasonable default matches this story's own "manual action, conscious
// cost" framing better than exposing a zoom picker.
export const DEFAULT_MIN_ZOOM = 12;
export const DEFAULT_MAX_ZOOM = 17;

// Matches OfflineManager.setTileCountLimit's own documented default — used
// here as the threshold past which a download is refused outright, not
// just warned about. Consult the map tile host's Terms of Service before
// ever raising this (per OfflineManager's own doc comment).
export const MAX_DOWNLOADABLE_TILES = 6000;

// radius_km is explicitly a guide, not a boundary (apps/geo's own design
// notes) — the balancer's merge/split step routinely produces segments
// extending past the nominal circle, so deriving bounds from lkpLat/
// lkpLng + radius risks silently excluding real searchable terrain from
// the downloaded pack. The segments' own geometry is exact.
//
// No antimeridian unwrapping — a search whose geometry straddles ±180°
// longitude would compute a bounding box spanning nearly the whole globe
// instead of a narrow band around the dateline. apps/geo caps radius at
// 50km, so this is only reachable for an LKP essentially on the dateline
// itself — a fail-safe edge case (the wildly inflated tile-count estimate
// trips MAX_DOWNLOADABLE_TILES and blocks the download with an honest
// "too large" message, rather than silently covering the wrong area).
export function boundsFromGeoJSON(
  geojson: FeatureCollection<Polygon | MultiPolygon>,
  paddingRatio = 0.1,
): LngLatBounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const visit = (position: Position) => {
    const [lng, lat] = position;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  };

  for (const feature of geojson.features) {
    const { geometry } = feature;
    if (geometry.type === 'Polygon') {
      geometry.coordinates.forEach((ring) => ring.forEach(visit));
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => ring.forEach(visit)));
    }
  }

  if (!Number.isFinite(west) || !Number.isFinite(south) || !Number.isFinite(east) || !Number.isFinite(north)) {
    return null;
  }

  const lngPad = (east - west) * paddingRatio;
  const latPad = (north - south) * paddingRatio;
  return [
    Math.max(west - lngPad, -180),
    Math.max(south - latPad, -85),
    Math.min(east + lngPad, 180),
    Math.min(north + latPad, 85),
  ];
}

function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

// Standard Web Mercator tile-pyramid count — the same tile grid every
// slippy-map tile server (including TomTom's) uses, so this is a real
// estimate of what createPack is actually about to request, not a rough
// guess. Summed across every zoom level in range, since each level is
// downloaded independently.
export function estimateTileCount(
  bounds: LngLatBounds,
  minZoom: number = DEFAULT_MIN_ZOOM,
  maxZoom: number = DEFAULT_MAX_ZOOM,
): number {
  const [west, south, east, north] = bounds;
  let total = 0;

  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lngToTileX(west, z);
    const xMax = lngToTileX(east, z);
    // Tile Y increases southward, so the northern edge gives the smaller
    // (min) tile row.
    const yMin = latToTileY(north, z);
    const yMax = latToTileY(south, z);
    total += (xMax - xMin + 1) * (yMax - yMin + 1);
  }

  return total;
}
