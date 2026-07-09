import logging
from collections import defaultdict

from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

from findthem_geo.config import settings
from findthem_geo.models.domain import H3Cell, Segment
from findthem_geo.models.request import Resource

logger = logging.getLogger(__name__)

_to_meters = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


def _area_km2(geom: Polygon | MultiPolygon) -> float:
    """Compute approximate area in km² by projecting to EPSG:3857."""
    if geom.is_empty:
        return 0.0
    if isinstance(geom, MultiPolygon):
        return sum(_area_km2(p) for p in geom.geoms)
    coords_m = [_to_meters.transform(x, y) for x, y in geom.exterior.coords]
    return Polygon(coords_m).area / 1e6


def _length_km(line: LineString) -> float:
    """Compute approximate length in km by projecting to EPSG:3857."""
    if line.is_empty:
        return 0.0
    coords_m = [_to_meters.transform(x, y) for x, y in line.coords]
    return LineString(coords_m).length / 1000.0


def _as_polygonal(
    geom: Polygon | MultiPolygon, fallback: Polygon | MultiPolygon
) -> Polygon | MultiPolygon:
    """Coerce an intersection result to a (Multi)Polygon.

    Intersecting a cell union with a segment can yield a MultiPolygon (or a
    GeometryCollection with stray edges). Keep every areal part — a MultiPolygon is a
    valid ``Segment.polygon`` — instead of discarding it and losing search area.
    """
    if geom.is_empty:
        return fallback
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    from shapely.ops import unary_union

    polys = [
        g for g in getattr(geom, "geoms", []) if isinstance(g, (Polygon, MultiPolygon))
    ]
    if not polys:
        return fallback
    return unary_union(polys)


def _classify_accessibility(
    segments: list[Segment],
    road_lines: list[LineString],
    vehicle_exclusion: BaseGeometry | None = None,
) -> None:
    """Compute road density and set vehicle_accessible for each segment.

    A segment is vehicle-accessible when its road density clears the threshold AND it
    is not mostly covered by no-car land use (park/pedestrian/water/farmland). The
    land-use veto stops cars being assigned to parks that merely happen to be ringed
    or crossed by roads.
    """
    threshold = settings.road_density_threshold
    veto_fraction = settings.vehicle_exclusion_min_fraction

    # Build spatial index over road lines for fast lookup
    tree = STRtree(road_lines) if road_lines else None

    for seg in segments:
        if seg.polygon.is_empty:
            seg.road_density = 0.0
            seg.vehicle_accessible = False
            continue
        area = _area_km2(seg.polygon)
        if area == 0:
            seg.road_density = 0.0
            seg.vehicle_accessible = False
            continue
        total_road_km = 0.0
        if tree is not None:
            candidate_idxs = tree.query(seg.polygon)
            for idx in candidate_idxs:
                line = road_lines[idx]
                try:
                    intersection = seg.polygon.intersection(line)
                except Exception:
                    continue
                if intersection.is_empty:
                    continue
                if isinstance(intersection, LineString):
                    total_road_km += _length_km(intersection)
                elif hasattr(intersection, "geoms"):
                    for geom in intersection.geoms:
                        if isinstance(geom, LineString):
                            total_road_km += _length_km(geom)
        seg.road_density = total_road_km / area
        seg.vehicle_accessible = seg.road_density >= threshold

        # Land-use veto: parks/pedestrian/water/farmland block vehicles even when
        # roads are dense nearby.
        if seg.vehicle_accessible and vehicle_exclusion is not None:
            if _no_car_fraction(seg.polygon, vehicle_exclusion) >= veto_fraction:
                seg.vehicle_accessible = False


def _no_car_fraction(
    polygon: Polygon | MultiPolygon, exclusion: BaseGeometry
) -> float:
    """Fraction of *polygon*'s area that overlaps no-car land use (0..1)."""
    if polygon.is_empty or exclusion.is_empty:
        return 0.0
    try:
        if not polygon.intersects(exclusion):
            return 0.0
        overlap = polygon.intersection(exclusion).area
    except Exception:
        return 0.0
    total = polygon.area
    return overlap / total if total > 0 else 0.0


def _compute_workload(segment: Segment, cells: list[H3Cell]) -> float:
    """
    workload = effective_area_km² × difficulty_factor
    effective_area = total_area - restricted_overlap
    difficulty_factor = 1.0 (future: terrain-based)
    """
    cell_map = {c.h3_index: c for c in cells}
    total_area = _area_km2(segment.polygon)

    restricted_area = 0.0
    for h3_idx in segment.cells:
        cell = cell_map.get(h3_idx)
        if cell:
            cell_area = _area_km2(cell.polygon)
            restricted_area += cell_area * cell.restricted_fraction

    effective = max(0.0, total_area - restricted_area)
    difficulty_factor = 1.0
    return effective * difficulty_factor


def _find_neighbors(segments: list[Segment]) -> dict[int, list[int]]:
    """Find adjacent segments (those sharing a boundary or near each other).

    Uses an STRtree so only bounding-box candidates are tested for adjacency,
    turning the old O(n^2) pairwise scan into roughly O(n log n). This matters a
    lot on dense real road networks (hundreds of faces).
    """
    neighbors: dict[int, list[int]] = defaultdict(list)
    non_empty = [s for s in segments if not s.polygon.is_empty]
    if len(non_empty) < 2:
        return {}

    tree = STRtree([s.polygon for s in non_empty])
    seen: set[tuple[int, int]] = set()
    for seg_a in non_empty:
        for ci in tree.query(seg_a.polygon):
            seg_b = non_empty[ci]
            if seg_b.segment_id == seg_a.segment_id:
                continue
            pair = (
                min(seg_a.segment_id, seg_b.segment_id),
                max(seg_a.segment_id, seg_b.segment_id),
            )
            if pair in seen:
                continue
            # Neighbors if they share a boundary (touch or overlap slightly).
            if seg_a.polygon.touches(seg_b.polygon) or (
                seg_a.polygon.distance(seg_b.polygon) < 1e-6
            ):
                neighbors[seg_a.segment_id].append(seg_b.segment_id)
                neighbors[seg_b.segment_id].append(seg_a.segment_id)
                seen.add(pair)
    return dict(neighbors)


def balance_segments(
    segments: list[Segment],
    cells: list[H3Cell],
    target_count: int | None = None,
    resources: list[Resource] | None = None,
    road_lines: list[LineString] | None = None,
    vehicle_exclusion: BaseGeometry | None = None,
) -> list[Segment]:
    """
    Balance workload across segments by merging small ones and splitting large ones.

    When *resources* is provided, uses speed-aware sizing: faster resources get
    proportionally larger segments, and vehicle types are only assigned to
    vehicle-accessible segments.

    When *resources* is None, falls back to threshold-based merge/split.
    """
    if len(segments) <= 1:
        for seg in segments:
            seg.total_area_km2 = _area_km2(seg.polygon)
            seg.workload = _compute_workload(seg, cells)
            seg.effective_area_km2 = seg.workload
        if resources and road_lines is not None:
            _classify_accessibility(segments, road_lines, vehicle_exclusion)
            # Check if the single segment is searchable before assigning
            min_area_km2 = settings.min_segment_area_m2 / 1e6
            for seg in segments:
                if seg.effective_area_km2 < min_area_km2:
                    seg.searchable = False
            searchable = [s for s in segments if s.searchable]
            if searchable:
                _assign_single_segment(searchable, resources)
        return segments

    # Compute initial workloads
    for seg in segments:
        seg.total_area_km2 = _area_km2(seg.polygon)
        seg.workload = _compute_workload(seg, cells)
        seg.effective_area_km2 = seg.workload

    workloads = [s.workload for s in segments]
    if not workloads or max(workloads) == 0:
        return segments

    mean_workload = sum(workloads) / len(workloads)
    if mean_workload == 0:
        return segments

    # --- Filter fully restricted segments ---
    min_area_km2 = settings.min_segment_area_m2 / 1e6
    searchable_segments = [s for s in segments if s.effective_area_km2 >= min_area_km2]
    restricted_segments = [s for s in segments if s.effective_area_km2 < min_area_km2]
    for seg in restricted_segments:
        seg.searchable = False

    # If all segments are restricted, return them as-is
    if not searchable_segments:
        for i, seg in enumerate(segments):
            seg.segment_id = i
        cell_map = {c.h3_index: c for c in cells}
        for seg in segments:
            for h3_idx in seg.cells:
                cell = cell_map.get(h3_idx)
                if cell:
                    cell.segment_id = seg.segment_id
        return segments

    # --- Resource-aware path: grow ≈one contiguous, speed-weighted zone per unit ---
    if resources and road_lines is not None:
        _classify_accessibility(searchable_segments, road_lines, vehicle_exclusion)
        searchable_segments = _grow_zones(searchable_segments, cells, resources)
    else:
        # --- Legacy path ---
        if target_count is not None and len(searchable_segments) > target_count:
            searchable_segments = _merge_to_target(searchable_segments, cells, target_count)
        else:
            workloads_s = [s.workload for s in searchable_segments]
            mean_wl = sum(workloads_s) / len(workloads_s) if workloads_s else 0
            searchable_segments = _threshold_merge(searchable_segments, cells, mean_wl)

        workloads_s = [s.workload for s in searchable_segments]
        mean_wl = sum(workloads_s) / len(workloads_s) if workloads_s else 0

        split_threshold = 3.0 if (target_count is not None) else 2.0
        if mean_wl > 0:
            searchable_segments = _split_large(
                searchable_segments, cells, mean_wl, split_threshold
            )

    # Recombine searchable + restricted
    segments = searchable_segments + restricted_segments

    # Re-index segment IDs sequentially
    for i, seg in enumerate(segments):
        seg.segment_id = i

    # Update cell assignments
    cell_map = {c.h3_index: c for c in cells}
    for seg in segments:
        for h3_idx in seg.cells:
            cell = cell_map.get(h3_idx)
            if cell:
                cell.segment_id = seg.segment_id

    return segments


def explode_multipolygons(
    segments: list[Segment], cells: list[H3Cell]
) -> list[Segment]:
    """Split any MultiPolygon segment into its connected parts (contiguity guarantee).

    A searcher's zone must be a single connected area. Whatever the merge/gap steps
    produced, this makes every returned segment a single Polygon: extra parts become
    their own segments (same resource type), and sub-minimum sliver parts are dropped
    (the largest part is always kept). Run this *after* the gap step.
    """
    min_area_km2 = settings.min_segment_area_m2 / 1e6
    cell_map = {c.h3_index: c for c in cells}

    out: list[Segment] = []
    for seg in segments:
        geom = seg.polygon
        if geom.is_empty or not isinstance(geom, MultiPolygon):
            out.append(seg)
            continue
        parts = sorted(
            (p for p in geom.geoms if not p.is_empty), key=lambda p: p.area, reverse=True
        )
        if len(parts) <= 1:
            if parts:
                seg.polygon = parts[0]
            out.append(seg)
            continue
        seg_cells = [cell_map[h] for h in seg.cells if h in cell_map]
        for i, part in enumerate(parts):
            area = _area_km2(part)
            if i > 0 and area < min_area_km2:
                continue  # drop tiny detached slivers (largest part always kept)
            part_cells = [
                c.h3_index for c in seg_cells if part.contains(c.polygon.centroid)
            ]
            new = Segment(segment_id=seg.segment_id, polygon=part, cells=part_cells)
            new.assigned_resource_type = seg.assigned_resource_type
            new.vehicle_accessible = seg.vehicle_accessible
            new.road_density = seg.road_density
            new.searchable = seg.searchable
            new.total_area_km2 = area
            new.workload = _compute_workload(new, cells)
            new.effective_area_km2 = new.workload
            out.append(new)

    for i, seg in enumerate(out):
        seg.segment_id = i
    for seg in out:
        for h3_idx in seg.cells:
            cell = cell_map.get(h3_idx)
            if cell:
                cell.segment_id = seg.segment_id
    return out


def _assign_single_segment(
    segments: list[Segment], resources: list[Resource]
) -> None:
    """Assign a resource type to a single segment."""
    if not segments or not resources:
        return
    seg = segments[0]
    vehicle_types = set(settings.vehicle_types)
    if seg.vehicle_accessible:
        seg.assigned_resource_type = resources[0].type
    else:
        # Pick first non-vehicle resource, or fall back to first
        for r in resources:
            if r.type not in vehicle_types:
                seg.assigned_resource_type = r.type
                return
        seg.assigned_resource_type = resources[0].type


def _grow_zones(
    blocks: list[Segment],
    cells: list[H3Cell],
    resources: list[Resource],
) -> list[Segment]:
    """Group road-bounded blocks into ≈one contiguous, speed-weighted zone per unit.

    Each resource unit (a single person/car/…) gets one connected zone sized in
    proportion to its search speed. Vehicle units only get vehicle-accessible zones.
    Zones are grown block-by-block over the adjacency graph so they are always
    contiguous — no scattered multi-patch segments.
    """
    speed_map = settings.resource_speed_kmh
    vehicle_types = set(settings.vehicle_types)

    units: list[dict] = []
    for r in resources:
        speed = speed_map.get(r.type, 5.0)
        for _ in range(r.count):
            units.append({"type": r.type, "speed": speed, "vehicle": r.type in vehicle_types})
    if not units or not blocks:
        return blocks

    vehicle_units = [u for u in units if u["vehicle"]]
    foot_units = [u for u in units if not u["vehicle"]]
    vehicle_blocks = [b for b in blocks if b.vehicle_accessible]
    foot_blocks = [b for b in blocks if not b.vehicle_accessible]

    # Split the universal (foot) units between the two pools by workload share, but
    # keep at least one unit in each non-empty pool and keep vehicle units off foot.
    veh_wl = sum(b.workload for b in vehicle_blocks)
    foot_wl = sum(b.workload for b in foot_blocks)
    total_wl = veh_wl + foot_wl

    pools: list[tuple[list[Segment], list[dict]]] = []
    if vehicle_blocks and foot_blocks:
        n_foot = len(foot_units)
        if total_wl > 0 and n_foot > 0:
            want = round(foot_wl / total_wl * n_foot)
        else:
            want = n_foot
        # Reserve a unit for the vehicle pool only if it has no dedicated vehicle units.
        hi = n_foot if vehicle_units else max(0, n_foot - 1)
        n_to_foot = max(1, min(want, hi)) if n_foot else 0
        pools.append((foot_blocks, foot_units[:n_to_foot]))
        pools.append((vehicle_blocks, vehicle_units + foot_units[n_to_foot:]))
    elif vehicle_blocks:
        pools.append((vehicle_blocks, units))  # no foot-only area — vehicles fine here
    else:
        # Only foot-only area exists — vehicle units cannot search it, fold to foot.
        pools.append((foot_blocks, foot_units + vehicle_units))

    result: list[Segment] = []
    for pool_blocks, pool_units in pools:
        if not pool_blocks:
            continue
        result.extend(_grow_pool(pool_blocks, cells, pool_units))

    # Contiguity-first: every zone stays a single connected area. Geography (canals,
    # parks, detached blocks) can force more zones than searchers — that is intended;
    # the coordinator hands nearby zones to the same volunteer. No cross-gap merging.
    return result


def _grow_pool(
    blocks: list[Segment],
    cells: list[H3Cell],
    units: list[dict],
) -> list[Segment]:
    """Grow *blocks* into contiguous, speed-weighted zones — one per unit.

    Zones are grown **within connected components** (strict shared-edge adjacency), so
    a zone can never be a scatter of disconnected patches. Scattered foot-only areas
    (parks, low-density blocks) therefore yield one zone per isolated cluster rather
    than a single map-spanning MultiPolygon.
    """
    accessible = blocks[0].vehicle_accessible if blocks else False
    fallback_type = min(units, key=lambda u: u["speed"])["type"] if units else "people"

    neighbors = _edge_neighbors(blocks)
    components = _connected_components(blocks, neighbors)
    comp_units = _allocate_units(components, units)

    zones: list[Segment] = []
    for comp, cu in zip(components, comp_units):
        zones.extend(_grow_component(comp, cells, neighbors, cu, accessible, fallback_type))
    return zones


def _allocate_units(
    components: list[list[Segment]], units: list[dict]
) -> list[list[dict]]:
    """Distribute *units* across connected components by workload (bigger → more, faster).

    Each component gets at least one unit while units remain; if there are more
    components than units, the largest components get one unit each and the rest get
    none (they still become a single zone, typed by the fallback).
    """
    n = len(components)
    if n == 0:
        return []
    wls = [sum(b.workload for b in c) for c in components]
    order = sorted(range(n), key=lambda i: wls[i], reverse=True)  # largest first
    total = sum(wls) or 1.0
    u = len(units)

    # Apportion units by workload share (largest-remainder). A big main component gets
    # many units (→ many balanced zones); tiny isolated components get 0 units and each
    # becomes a single fallback zone — never a giant blob and never a scatter.
    ideal = [u * wls[i] / total for i in range(n)]
    counts = [int(x) for x in ideal]
    left = u - sum(counts)
    frac_order = sorted(range(n), key=lambda i: ideal[i] - counts[i], reverse=True)
    for i in range(left):
        counts[frac_order[i]] += 1

    # Cap a component's zone count at its block count.
    counts = [min(counts[i], len(components[i])) for i in range(n)]

    # Hand out the fastest units to the components getting the most zones.
    fast_first = sorted(units, key=lambda x: x["speed"], reverse=True)
    result: list[list[dict]] = [[] for _ in range(n)]
    pos = 0
    for i in order:
        take = counts[i]
        result[i] = fast_first[pos : pos + take]
        pos += take
    return result


def _grow_component(
    comp: list[Segment],
    cells: list[H3Cell],
    neighbors: dict[int, list[int]],
    units: list[dict],
    accessible: bool,
    fallback_type: str,
) -> list[Segment]:
    """Region-grow one connected component into ``len(units)`` speed-weighted zones."""
    k = min(len(units), len(comp))
    if k <= 1:
        zone = _merge_blocks(comp, cells, accessible)
        zone.assigned_resource_type = units[0]["type"] if units else fallback_type
        return [zone]

    by_id = {b.segment_id: b for b in comp}
    comp_ids = set(by_id)
    used_units = sorted(units, key=lambda u: u["speed"])[:k]
    seeds = _pick_seeds(comp, k)

    total_wl = sum(b.workload for b in comp)
    speed_sum = sum(u["speed"] for u in used_units) or 1.0
    zones = [
        {"blocks": [s], "wl": s.workload, "target": total_wl * used_units[i]["speed"] / speed_sum}
        for i, s in enumerate(seeds)
    ]
    claimed = {s.segment_id for s in seeds}

    # Hand the next block to the most under-target zone that can reach an unclaimed
    # neighbour — every zone stays connected because it only ever grows into an edge
    # neighbour of a block it already owns.
    while len(claimed) < len(comp):
        best_zone = None
        best_block = None
        best_deficit = float("-inf")
        for z in zones:
            frontier = {
                nb
                for b in z["blocks"]
                for nb in neighbors.get(b.segment_id, [])
                if nb in comp_ids and nb not in claimed
            }
            if not frontier:
                continue
            deficit = z["target"] - z["wl"]
            if deficit > best_deficit:
                best_deficit = deficit
                best_zone = z
                best_block = min(frontier, key=lambda nid: by_id[nid].workload)
        if best_zone is None:
            break
        b = by_id[best_block]
        best_zone["blocks"].append(b)
        best_zone["wl"] += b.workload
        claimed.add(best_block)

    result = [_merge_blocks(z["blocks"], cells, accessible) for z in zones]
    # Assign types: fastest units to the largest zones (so cars get more ground).
    result.sort(key=lambda s: s.workload)
    for i, seg in enumerate(result):
        unit = used_units[i] if i < len(used_units) else used_units[-1]
        seg.assigned_resource_type = unit["type"]
    return result


def _edge_neighbors(blocks: list[Segment]) -> dict[int, list[int]]:
    """Adjacency by shared *edge* (positive-length boundary), not point contact.

    Point/near contact is excluded so a zone's block union is always a single
    connected polygon rather than pieces meeting at a corner.
    """
    neighbors: dict[int, list[int]] = defaultdict(list)
    non_empty = [s for s in blocks if not s.polygon.is_empty]
    if len(non_empty) < 2:
        return {}
    tree = STRtree([s.polygon for s in non_empty])
    seen: set[tuple[int, int]] = set()
    for seg_a in non_empty:
        for ci in tree.query(seg_a.polygon):
            seg_b = non_empty[ci]
            if seg_b.segment_id == seg_a.segment_id:
                continue
            pair = (
                min(seg_a.segment_id, seg_b.segment_id),
                max(seg_a.segment_id, seg_b.segment_id),
            )
            if pair in seen:
                continue
            seen.add(pair)
            try:
                inter = seg_a.polygon.intersection(seg_b.polygon)
            except Exception:
                continue
            if inter.is_empty or inter.length <= 0:
                continue  # touch at a point only — not a shared edge
            neighbors[seg_a.segment_id].append(seg_b.segment_id)
            neighbors[seg_b.segment_id].append(seg_a.segment_id)
    return dict(neighbors)


def _connected_components(
    blocks: list[Segment], neighbors: dict[int, list[int]]
) -> list[list[Segment]]:
    """Split blocks into connected components over the edge-adjacency graph."""
    by_id = {b.segment_id: b for b in blocks}
    seen: set[int] = set()
    components: list[list[Segment]] = []
    for b in blocks:
        if b.segment_id in seen:
            continue
        stack = [b.segment_id]
        seen.add(b.segment_id)
        comp: list[Segment] = []
        while stack:
            cur = stack.pop()
            comp.append(by_id[cur])
            for nb in neighbors.get(cur, []):
                if nb not in seen:
                    seen.add(nb)
                    stack.append(nb)
        components.append(comp)
    return components


def _pick_seeds(blocks: list[Segment], k: int) -> list[Segment]:
    """Pick *k* spread-out seed blocks via farthest-point sampling on centroids."""
    pts = [(b.polygon.centroid.x, b.polygon.centroid.y) for b in blocks]
    seeds = [max(range(len(blocks)), key=lambda i: blocks[i].workload)]
    while len(seeds) < k:
        best_i = -1
        best_d = -1.0
        for i in range(len(blocks)):
            if i in seeds:
                continue
            d = min((pts[i][0] - pts[s][0]) ** 2 + (pts[i][1] - pts[s][1]) ** 2 for s in seeds)
            if d > best_d:
                best_d = d
                best_i = i
        seeds.append(best_i)
    return [blocks[i] for i in seeds]


def _merge_blocks(
    blocks: list[Segment], cells: list[H3Cell], accessible: bool
) -> Segment:
    """Union a set of blocks into one Segment with combined cells and metadata."""
    from shapely.ops import unary_union

    polys = [b.polygon for b in blocks if not b.polygon.is_empty]
    poly = unary_union(polys) if polys else Polygon()
    all_cells: list[str] = []
    for b in blocks:
        all_cells.extend(b.cells)
    seg = Segment(
        segment_id=min(b.segment_id for b in blocks),
        polygon=poly,
        cells=all_cells,
    )
    seg.vehicle_accessible = accessible
    seg.total_area_km2 = _area_km2(seg.polygon)
    seg.workload = _compute_workload(seg, cells)
    seg.effective_area_km2 = seg.workload
    return seg


def _merge_to_target(
    segments: list[Segment],
    cells: list[H3Cell],
    target_count: int,
) -> list[Segment]:
    """Iteratively merge smallest segments until len(segments) <= target_count."""
    seg_map = {s.segment_id: s for s in segments}

    while len(seg_map) > target_count:
        remaining = list(seg_map.values())
        neighbors = _find_neighbors(remaining)

        # Find smallest-workload segment that has at least one neighbor
        candidates = sorted(remaining, key=lambda s: s.workload)
        merged = False
        for src in candidates:
            src_neighbors = neighbors.get(src.segment_id, [])
            valid = [n for n in src_neighbors if n in seg_map]
            if not valid:
                continue
            # Merge into smallest neighbor
            dst_id = min(
                valid,
                key=lambda n: seg_map[n].workload,
            )
            dst = seg_map[dst_id]
            dst.cells.extend(src.cells)
            if not dst.polygon.is_empty and not src.polygon.is_empty:
                dst.polygon = dst.polygon.union(src.polygon)
            dst.workload = _compute_workload(dst, cells)
            dst.total_area_km2 = _area_km2(dst.polygon)
            dst.effective_area_km2 = dst.workload
            del seg_map[src.segment_id]
            merged = True
            break

        if not merged:
            # No mergeable segment found (all isolated) — stop to avoid infinite loop
            break

    return list(seg_map.values())


def _threshold_merge(
    segments: list[Segment],
    cells: list[H3Cell],
    mean_workload: float,
) -> list[Segment]:
    """Original merge logic: merge segments below 0.3× mean into smallest neighbor."""
    neighbors = _find_neighbors(segments)
    merged_into: dict[int, int] = {}

    for seg in sorted(segments, key=lambda s: s.workload):
        if seg.workload >= 0.3 * mean_workload:
            continue
        seg_neighbors = neighbors.get(seg.segment_id, [])
        if not seg_neighbors:
            continue
        valid_neighbors = [n for n in seg_neighbors if n not in merged_into]
        if not valid_neighbors:
            continue
        target_id = min(
            valid_neighbors,
            key=lambda n: next(s.workload for s in segments if s.segment_id == n),
        )
        merged_into[seg.segment_id] = target_id

    if merged_into:
        seg_map = {s.segment_id: s for s in segments}
        for src_id, dst_id in merged_into.items():
            src = seg_map[src_id]
            dst = seg_map[dst_id]
            dst.cells.extend(src.cells)
            if not dst.polygon.is_empty and not src.polygon.is_empty:
                dst.polygon = dst.polygon.union(src.polygon)
            dst.workload = _compute_workload(dst, cells)
            dst.total_area_km2 = _area_km2(dst.polygon)
            dst.effective_area_km2 = dst.workload
        segments = [s for s in segments if s.segment_id not in merged_into]

    return segments


def _split_large(
    segments: list[Segment],
    cells: list[H3Cell],
    mean_workload: float,
    threshold: float,
) -> list[Segment]:
    """Split segments above threshold× mean workload by bisecting H3 cells."""
    from shapely.ops import unary_union

    new_segments = []
    next_id = max(s.segment_id for s in segments) + 1

    for seg in segments:
        if seg.workload <= threshold * mean_workload or len(seg.cells) < 2:
            new_segments.append(seg)
            continue

        cell_map = {c.h3_index: c for c in cells}
        seg_cells = [cell_map[idx] for idx in seg.cells if idx in cell_map]
        seg_cells.sort(key=lambda c: c.polygon.centroid.x)

        mid = len(seg_cells) // 2
        left_cells = seg_cells[:mid]
        right_cells = seg_cells[mid:]

        left_poly = (
            unary_union([c.polygon for c in left_cells]) if left_cells else Polygon()
        )
        right_poly = (
            unary_union([c.polygon for c in right_cells]) if right_cells else Polygon()
        )

        if not seg.polygon.is_empty:
            if not left_poly.is_empty:
                left_poly = left_poly.intersection(seg.polygon)
            if not right_poly.is_empty:
                right_poly = right_poly.intersection(seg.polygon)

        left_seg = Segment(
            segment_id=seg.segment_id,
            polygon=_as_polygonal(left_poly, seg.polygon),
            cells=[c.h3_index for c in left_cells],
        )
        right_seg = Segment(
            segment_id=next_id,
            polygon=_as_polygonal(right_poly, Polygon()),
            cells=[c.h3_index for c in right_cells],
        )
        next_id += 1

        # A split just halves one segment — both halves keep the parent's resource
        # assignment and accessibility (otherwise splitting silently drops the
        # assigned type, e.g. cars land on the largest segments and vanish on split).
        for child in (left_seg, right_seg):
            child.assigned_resource_type = seg.assigned_resource_type
            child.vehicle_accessible = seg.vehicle_accessible
            child.searchable = seg.searchable

        # If the right piece has no areal geometry, don't emit an empty searchable
        # segment — fold its cells back into the left piece so none are lost.
        if right_cells and right_seg.polygon.is_empty:
            left_seg.cells.extend(right_seg.cells)
            right_cells = []

        left_seg.total_area_km2 = _area_km2(left_seg.polygon)
        left_seg.workload = _compute_workload(left_seg, cells)
        left_seg.effective_area_km2 = left_seg.workload
        right_seg.total_area_km2 = _area_km2(right_seg.polygon)
        right_seg.workload = _compute_workload(right_seg, cells)
        right_seg.effective_area_km2 = right_seg.workload

        new_segments.append(left_seg)
        if right_cells:
            new_segments.append(right_seg)

    return new_segments
