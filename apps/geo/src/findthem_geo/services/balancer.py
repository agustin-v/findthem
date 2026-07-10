import logging
from collections import Counter, defaultdict

from shapely import STRtree
from shapely.geometry import GeometryCollection, LineString, MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

from findthem_geo.config import settings
from findthem_geo.models.domain import H3Cell, Segment
from findthem_geo.models.request import Resource
from findthem_geo.services.geometry import area_km2 as _area_km2
from findthem_geo.services.geometry import length_km as _length_km

logger = logging.getLogger(__name__)

# A vehicle zone may absorb foot-only pockets up to this share of workload — the crew
# parks and checks them on foot. Also the cutoff for re-homing small orphan parts.
_DISMOUNT_SHARE = 0.25


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
            pieces = []
            for idx in tree.query(seg.polygon):
                try:
                    intersection = seg.polygon.intersection(road_lines[idx])
                except Exception:
                    continue
                if not intersection.is_empty:
                    pieces.append(intersection)
            if pieces:
                # One projected length for all pieces beats thousands of tiny calls.
                total_road_km = _length_km(GeometryCollection(pieces))
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
    """Grow exactly one speed-weighted zone per resource unit over the block graph.

    Universal units (people/drones) seed *at* foot-only islands (parks, canal edges)
    and grow outward into the surrounding streets, so a person gets a properly sized
    area around the island rather than just the island. Vehicle units only ever claim
    vehicle-accessible blocks. Unreached leftovers attach to the nearest compatible
    zone, so the searchable count always equals the unit count (capped by blocks).
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

    neighbors = _edge_neighbors(blocks)
    by_id = {b.segment_id: b for b in blocks}
    veh_ids = {b.segment_id for b in blocks if b.vehicle_accessible}
    foot_blocks = [b for b in blocks if not b.vehicle_accessible]

    vehicle_units = [u for u in units if u["vehicle"]]
    universal_units = [u for u in units if not u["vehicle"]]

    # Vehicle units beyond the vehicle-accessible ground dismount and act universal.
    n_veh = min(len(vehicle_units), len(veh_ids))
    universal_units = universal_units + vehicle_units[n_veh:]
    vehicle_units = vehicle_units[:n_veh]
    n_uni = min(len(universal_units), len(blocks) - n_veh)
    universal_units = sorted(universal_units, key=lambda u: u["speed"])[:n_uni]

    chosen = vehicle_units + universal_units
    if not chosen:
        return blocks
    total_wl = sum(b.workload for b in blocks)
    speed_sum = sum(u["speed"] for u in chosen) or 1.0

    # --- Seeding ---
    zone_specs: list[tuple[dict, Segment]] = []
    taken: set[int] = set()

    # Universal zones seed on the biggest foot islands first (fastest unit ↔ biggest
    # island) — the person starts at the park/canal and grows into the streets.
    foot_components = _connected_components(foot_blocks, neighbors) if foot_blocks else []
    foot_components.sort(key=lambda c: sum(b.workload for b in c), reverse=True)
    uni_by_speed = sorted(universal_units, key=lambda u: u["speed"], reverse=True)
    for unit, comp in zip(uni_by_speed, foot_components):
        seed = max(comp, key=lambda b: b.workload)
        zone_specs.append((unit, seed))
        taken.add(seed.segment_id)

    # Vehicle zones spread out over vehicle-accessible blocks.
    seed_pts = [s.polygon.centroid for _, s in zone_specs]
    veh_candidates = [by_id[i] for i in veh_ids if i not in taken]
    for unit, seed in zip(vehicle_units, _pick_seeds(veh_candidates, len(vehicle_units), seed_pts)):
        zone_specs.append((unit, seed))
        taken.add(seed.segment_id)
        seed_pts.append(seed.polygon.centroid)

    # Remaining universal units spread over whatever is left (any block type).
    rest_units = uni_by_speed[len(foot_components):]
    rest_candidates = [b for b in blocks if b.segment_id not in taken]
    for unit, seed in zip(rest_units, _pick_seeds(rest_candidates, len(rest_units), seed_pts)):
        zone_specs.append((unit, seed))
        taken.add(seed.segment_id)
        seed_pts.append(seed.polygon.centroid)

    # --- Growth: most under-target zone claims its cheapest eligible frontier block ---
    zones: list[dict] = []
    claimed: set[int] = set(taken)
    for unit, seed in zone_specs:
        allow_foot = not unit["vehicle"]
        zones.append(
            {
                "unit": unit,
                "blocks": [seed],
                "wl": seed.workload,
                "target": total_wl * unit["speed"] / speed_sum,
                "allow_foot": allow_foot,
                "frontier": {
                    nb
                    for nb in neighbors.get(seed.segment_id, [])
                    if nb not in claimed and (allow_foot or nb in veh_ids)
                },
            }
        )

    # Least-filled zone (wl relative to its speed target) grows next — absolute
    # deficits would let fast units starve slow ones out of every block.
    while len(claimed) < len(blocks):
        best_i = -1
        best_fill = float("inf")
        for i, z in enumerate(zones):
            if not z["frontier"]:
                continue
            fill = z["wl"] / z["target"] if z["target"] > 0 else float("inf")
            if fill < best_fill:
                best_fill = fill
                best_i = i
        if best_i < 0:
            break
        z = zones[best_i]
        block_id = min(z["frontier"], key=lambda nid: by_id[nid].workload)
        b = by_id[block_id]
        z["blocks"].append(b)
        z["wl"] += b.workload
        claimed.add(block_id)
        for other in zones:
            other["frontier"].discard(block_id)
        z["frontier"] |= {
            nb
            for nb in neighbors.get(block_id, [])
            if nb not in claimed and (z["allow_foot"] or nb in veh_ids)
        }

    # --- Leftovers (unreachable components) attach to the nearest compatible zone ---
    leftover = [by_id[i] for i in by_id if i not in claimed]
    for comp in _connected_components(leftover, neighbors):
        has_foot = any(not b.vehicle_accessible for b in comp)
        cands = [z for z in zones if z["allow_foot"]] if has_foot else zones
        cands = cands or zones
        pt = comp[0].polygon.centroid
        dst = min(cands, key=lambda z: min(pt.distance(b.polygon) for b in z["blocks"]))
        dst["blocks"].extend(comp)
        dst["wl"] += sum(b.workload for b in comp)

    # --- Re-home orphans: a zone's detached component embedded in another zone's
    # territory moves to an adjacent zone. Compatible neighbours first; a small foot
    # pocket enclosed by a car zone merges anyway (the crew dismounts for it).
    owner: dict[int, int] = {}
    for zi, z in enumerate(zones):
        for b in z["blocks"]:
            owner[b.segment_id] = zi
    mean_target = total_wl / max(1, len(zones))
    for zi, z in enumerate(zones):
        comps = _connected_components(z["blocks"], neighbors)
        if len(comps) <= 1:
            continue
        comps.sort(key=lambda c: sum(b.workload for b in c), reverse=True)
        for comp in comps[1:]:
            comp_ids = {b.segment_id for b in comp}
            adj = Counter(
                owner[nb]
                for bid in comp_ids
                for nb in neighbors.get(bid, [])
                if nb in owner and owner[nb] != zi and nb not in comp_ids
            )
            if not adj:
                continue
            comp_wl = sum(b.workload for b in comp)
            has_foot = any(not b.vehicle_accessible for b in comp)
            cand = [j for j in adj if zones[j]["allow_foot"]] if has_foot else list(adj)
            if not cand and comp_wl <= _DISMOUNT_SHARE * mean_target:
                cand = list(adj)
            if not cand:
                continue
            dst_i = max(cand, key=lambda j: adj[j])  # most shared boundary wins
            z["blocks"] = [b for b in z["blocks"] if b.segment_id not in comp_ids]
            z["wl"] -= comp_wl
            zones[dst_i]["blocks"].extend(comp)
            zones[dst_i]["wl"] += comp_wl
            for bid in comp_ids:
                owner[bid] = dst_i

    # --- Rebind: fastest compatible units to the largest zones (cars get more ground).
    # "Mostly vehicle" (foot share ≤ dismount threshold) counts as car-compatible.
    zones.sort(key=lambda z: z["wl"], reverse=True)
    veh_left = sorted(vehicle_units, key=lambda u: u["speed"], reverse=True)
    uni_left = sorted(universal_units, key=lambda u: u["speed"], reverse=True)
    result: list[Segment] = []
    for z in zones:
        foot_wl = sum(b.workload for b in z["blocks"] if not b.vehicle_accessible)
        mostly_vehicle = z["wl"] <= 0 or foot_wl / z["wl"] <= _DISMOUNT_SHARE
        if mostly_vehicle and veh_left:
            unit = veh_left.pop(0)
        elif uni_left:
            unit = uni_left.pop(0)
        else:
            unit = veh_left.pop(0)  # forced dismount — no universal units left
        seg = _merge_blocks(z["blocks"], cells, mostly_vehicle)
        seg.assigned_resource_type = unit["type"]
        result.append(seg)
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
    """Split blocks into connected components over the edge-adjacency graph.

    ``neighbors`` may cover a superset of *blocks*; edges leading outside are ignored.
    """
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
                if nb in by_id and nb not in seen:
                    seen.add(nb)
                    stack.append(nb)
        components.append(comp)
    return components


def _pick_seeds(
    blocks: list[Segment], k: int, avoid_pts: list | None = None
) -> list[Segment]:
    """Pick ≤*k* spread-out seed blocks via farthest-point sampling on centroids.

    ``avoid_pts`` are centroids of already-placed seeds — new seeds spread away from
    them too.
    """
    k = min(k, len(blocks))
    if k <= 0:
        return []
    pts = [(b.polygon.centroid.x, b.polygon.centroid.y) for b in blocks]
    refs = [(p.x, p.y) for p in (avoid_pts or [])]
    seeds: list[int] = []
    if not refs:
        first = max(range(len(blocks)), key=lambda i: blocks[i].workload)
        seeds.append(first)
        refs.append(pts[first])
    while len(seeds) < k:
        best_i = -1
        best_d = -1.0
        for i in range(len(blocks)):
            if i in seeds:
                continue
            d = min((pts[i][0] - r[0]) ** 2 + (pts[i][1] - r[1]) ** 2 for r in refs)
            if d > best_d:
                best_d = d
                best_i = i
        seeds.append(best_i)
        refs.append(pts[best_i])
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
