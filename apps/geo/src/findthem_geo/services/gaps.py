"""Step 7: single-owner road gaps.

A road must belong to exactly one searcher, with a visible gap on the other side.
Segments here are contiguous multi-block *zones*, so a zone's **internal** roads (those
inside its own footprint) must stay with the zone — carving them out would split the
zone into disconnected pieces. Only roads on the boundary *between two zones* are
contested.

Processing zones lighter-workload first, each zone keeps its whole footprint (internal
roads included) and reaches across the adjacent boundary corridor to enclose it; because
the lighter zone goes first it claims the full boundary road, and the heavier zone then
recedes by ``gap_m``. The owner overshoots the far edge by ``owner_offset_m`` so it
clearly encloses the road.
"""

import logging

from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.ops import transform, unary_union

from findthem_geo.models.domain import Segment
from findthem_geo.services.geometry import mercator_scale, to_meters, to_wgs84

logger = logging.getLogger(__name__)

_to_m = to_meters.transform
_to_wgs = to_wgs84.transform


def _clean(geom: Polygon | MultiPolygon) -> Polygon | MultiPolygon:
    """Repair self-intersections that buffer/difference can introduce."""
    if geom.is_empty:
        return geom
    if not geom.is_valid:
        geom = geom.buffer(0)
    return geom


def apply_road_gaps(
    segments: list[Segment],
    road_lines: list[LineString],
    road_half_width_m: float,
    gap_m: float,
    owner_offset_m: float = 1.5,
) -> None:
    """Mutate ``segments`` in place so each road belongs to a single segment + gap."""
    workable = [s for s in segments if not s.polygon.is_empty]
    if not workable or not road_lines or road_half_width_m <= 0:
        return

    # Buffers happen in EPSG:3857, where 1 real metre is sec(lat) projected metres —
    # scale the widths so gaps/corridors have their true size at any latitude.
    scale = mercator_scale(workable[0].polygon.centroid.y)
    road_half_width_m *= scale
    gap_m *= scale
    owner_offset_m *= scale

    # The corridor the owner encloses (road width + overshoot), in metres. Cheap per-line
    # buffers with coarse arcs + cascaded union beat one giant network buffer by ~10×.
    road_m = [transform(_to_m, ln) for ln in road_lines]
    owned_corridor = _clean(
        unary_union([ln.buffer(road_half_width_m + owner_offset_m, quad_segs=4) for ln in road_m])
    )
    if owned_corridor.is_empty:
        return
    # A grab must reach across a full corridor (2× half-width) plus the overshoot.
    reach = 2.0 * road_half_width_m + owner_offset_m + 1.0

    faces_m: dict[int, Polygon | MultiPolygon] = {
        s.segment_id: _clean(transform(_to_m, s.polygon)) for s in workable
    }

    # Lighter workload first. Each zone keeps its whole footprint (so internal roads are
    # never removed — the zone stays connected) and reaches over the adjacent boundary
    # corridor. Earlier zones' gap-buffered footprints are kept as parts and only the
    # bbox-overlapping ones are differenced — no ever-growing union/buffer.
    taken_parts: list[tuple[tuple[float, float, float, float], Polygon | MultiPolygon]] = []
    result: dict[int, Polygon | MultiPolygon] = {}

    for s in sorted(workable, key=lambda seg: seg.workload):
        face = faces_m[s.segment_id]
        if face.is_empty:
            continue

        adjacent = owned_corridor.intersection(face.buffer(reach))
        own = _clean(unary_union([face, adjacent])) if not adjacent.is_empty else face

        # Recede from nearby already-owned zones, opening the gap on the non-owner side.
        if taken_parts and gap_m > 0:
            minx, miny, maxx, maxy = own.bounds
            near = [
                g
                for (b, g) in taken_parts
                if not (
                    b[2] < minx - gap_m
                    or b[0] > maxx + gap_m
                    or b[3] < miny - gap_m
                    or b[1] > maxy + gap_m
                )
            ]
            if near:
                # Buffer only the local neighbourhood, never an accumulated union.
                own = _clean(own.difference(unary_union(near).buffer(gap_m, quad_segs=4)))

        if own.is_empty:
            own = face  # never let a zone vanish

        result[s.segment_id] = own
        if not own.is_empty:
            taken_parts.append((own.bounds, own))

    for s in workable:
        geom_m = result[s.segment_id]
        if geom_m.is_empty:
            continue
        s.polygon = _clean(transform(_to_wgs, geom_m))
