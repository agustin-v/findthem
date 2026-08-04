import logging
import time

from shapely import STRtree
from shapely.geometry import MultiPolygon, Point, Polygon, mapping
from shapely.ops import transform, unary_union

from findthem_geo.config import settings
from findthem_geo.models.request import GenerateSegmentsRequest
from findthem_geo.models.response import SegmentsResponse
from findthem_geo.services.balancer import balance_segments
from findthem_geo.services.gaps import apply_road_gaps
from findthem_geo.services.geometry import distance_km, mercator_scale, to_meters, to_wgs84
from findthem_geo.services.h3_grid import generate_h3_grid
from findthem_geo.services.osm_fetcher import fetch_osm_data
from findthem_geo.services.restriction import classify_cells
from findthem_geo.services.road_polygons import _extract_road_lines, build_road_polygons
from findthem_geo.services.segmentation import assign_cells_to_segments

logger = logging.getLogger(__name__)


def _inset_polygon(
    geom: Polygon | MultiPolygon, inset_m: float
) -> Polygon | MultiPolygon:
    """Shrink a polygon by *inset_m* true metres to create visual gaps."""
    if geom.is_empty or inset_m <= 0:
        return geom

    merc = transform(to_meters.transform, geom)
    buffered = merc.buffer(-inset_m * mercator_scale(geom.centroid.y))

    if buffered.is_empty:
        return geom  # Too small to inset — keep original

    if isinstance(buffered, MultiPolygon):
        buffered = max(buffered.geoms, key=lambda p: p.area)

    return transform(to_wgs84.transform, buffered)


def run_pipeline(req: GenerateSegmentsRequest) -> SegmentsResponse:
    """Orchestrate the full geo processing pipeline (Steps 1-6).

    Synchronous (CPU/IO-bound). Call via ``run_in_threadpool`` from the async
    endpoint so a slow request never blocks the event loop.
    """
    timings: dict[str, int] = {}
    _t = time.perf_counter()

    def _mark(name: str) -> None:
        nonlocal _t
        now = time.perf_counter()
        timings[name] = round((now - _t) * 1000)
        _t = now

    # Step 1: Generate H3 grid
    cells = generate_h3_grid(
        lat=req.center.lat,
        lng=req.center.lng,
        radius_km=req.radius_km,
        resolution=req.h3_resolution,
    )
    _mark("grid")

    # Step 2: Fetch OSM data (roads + restricted areas)
    osm_data = fetch_osm_data(
        lat=req.center.lat,
        lng=req.center.lng,
        radius_km=req.radius_km,
    )
    _mark("fetch")

    # Step 3: Build road-bounded polygons
    road_polys = build_road_polygons(
        graph=osm_data.road_graph,
        lat=req.center.lat,
        lng=req.center.lng,
        radius_km=req.radius_km,
    )
    _mark("polys")

    # Step 4: Classify H3 cells vs restricted areas
    cells = classify_cells(cells, osm_data.restricted_areas)

    # Step 5: Assign H3 cells to road-bounded segments
    segments = assign_cells_to_segments(cells, road_polys)

    # Extract road lines for accessibility classification
    road_lines = _extract_road_lines(osm_data.road_graph) if osm_data.road_graph else []
    _mark("segment")

    # No-car land use (parks/pedestrian/water/farmland) — union used to veto vehicle
    # assignment on segments that mostly overlap it.
    land_use_union = None
    if osm_data.land_use_areas:
        lu_polys = [la.polygon for la in osm_data.land_use_areas if la.polygon.is_valid]
        if lu_polys:
            land_use_union = unary_union(lu_polys)

    # Step 6: Balance workload with resource awareness
    target_count = sum(r.count for r in req.resources) if req.resources else None
    segments = balance_segments(
        segments,
        cells,
        target_count=target_count,
        resources=req.resources if req.resources else None,
        road_lines=road_lines if road_lines else None,
        vehicle_exclusion=land_use_union,
    )
    _mark("balance")

    # Step 7: Assign each road corridor to a single segment (the lighter-workload
    # neighbour) and open a gap on the other side. Falls back to a symmetric inset
    # when there are no roads (single-circle segment).
    gap_m = settings.segment_inset_m
    if road_lines:
        apply_road_gaps(
            segments,
            road_lines,
            road_half_width_m=settings.road_half_width_m,
            gap_m=gap_m,
            owner_offset_m=settings.road_owner_offset_m,
        )
    elif gap_m > 0:
        for seg in segments:
            inset_poly = _inset_polygon(seg.polygon, gap_m)
            if not inset_poly.is_empty:
                seg.polygon = inset_poly

    # A segment with no areal geometry (degenerate split/gap result) cannot be searched
    # or ranked — mark it unsearchable so the loops below never hit an empty centroid.
    for seg in segments:
        if seg.polygon.is_empty:
            seg.searchable = False

    # --- Estimated search time ---
    for seg in segments:
        if seg.searchable:
            speed = settings.resource_speed_kmh.get(
                seg.assigned_resource_type or "people", 5.0
            )
            seg.estimated_hours = round(seg.effective_area_km2 / speed, 4) if speed else 0.0
        else:
            seg.estimated_hours = 0.0

    # --- LKP-distance priority ---
    searchable_segs = [s for s in segments if s.searchable]
    for seg in searchable_segs:
        centroid = seg.polygon.centroid
        seg.lkp_distance_km = round(
            distance_km(req.center.lng, req.center.lat, centroid.x, centroid.y), 4
        )
    searchable_segs.sort(key=lambda s: s.lkp_distance_km)
    for rank, seg in enumerate(searchable_segs, start=1):
        seg.priority = rank
    for seg in segments:
        if not seg.searchable:
            seg.priority = 0
            seg.lkp_distance_km = 0.0

    # --- Entry / access points ---
    if osm_data.road_graph and osm_data.road_graph.number_of_nodes() > 0:
        node_data = list(osm_data.road_graph.nodes(data=True))
        node_geoms = [Point(d["x"], d["y"]) for _, d in node_data]
        node_tree = STRtree(node_geoms)
        for seg in segments:
            if seg.searchable and not seg.polygon.is_empty:
                nearest_idx = node_tree.nearest(seg.polygon.boundary)
                pt = node_geoms[nearest_idx]
                seg.entry_point = [round(pt.x, 6), round(pt.y, 6)]

    # Build GeoJSON response
    segment_features = []
    for seg in segments:
        if seg.polygon.is_empty:
            continue  # drop degenerate segments — no geometry to render
        segment_features.append(
            {
                "type": "Feature",
                "geometry": mapping(seg.polygon),
                "properties": {
                    "segment_id": seg.segment_id,
                    "cell_count": len(seg.cells),
                    "cells": seg.cells,
                    "total_area_km2": round(seg.total_area_km2, 4),
                    "effective_area_km2": round(seg.effective_area_km2, 4),
                    "workload": round(seg.workload, 4),
                    "assigned_resource_type": seg.assigned_resource_type,
                    "road_density": round(seg.road_density, 2),
                    "vehicle_accessible": seg.vehicle_accessible,
                    "searchable": seg.searchable,
                    "estimated_hours": seg.estimated_hours,
                    "priority": seg.priority,
                    "lkp_distance_km": round(seg.lkp_distance_km, 4),
                    "entry_point": seg.entry_point,
                },
            }
        )

    restricted_features = []
    for ra in osm_data.restricted_areas:
        restricted_features.append(
            {
                "type": "Feature",
                "geometry": mapping(ra.polygon),
                "properties": {
                    "name": ra.name,
                    "restriction_type": ra.restriction_type,
                },
            }
        )

    # Build resource assignment summary
    resource_assignment: dict[str, int] = {}
    for seg in segments:
        if seg.assigned_resource_type:
            resource_assignment[seg.assigned_resource_type] = (
                resource_assignment.get(seg.assigned_resource_type, 0) + 1
            )

    _mark("finalize")
    logger.info(
        "pipeline timings (ms): %s total=%d | cells=%d faces=%d segments=%d",
        timings, sum(timings.values()), len(cells), len(road_polys), len(segments),
    )

    meta: dict = {
        "center": {"lat": req.center.lat, "lng": req.center.lng},
        "radius_km": req.radius_km,
        "h3_resolution": req.h3_resolution,
        "total_cells": len(cells),
        "total_segments": len(segments),
        "restricted_areas_count": len(osm_data.restricted_areas),
        "timings_ms": timings,
    }
    if resource_assignment:
        meta["resource_assignment"] = resource_assignment

    return SegmentsResponse(
        segments={"type": "FeatureCollection", "features": segment_features},
        restricted_areas={"type": "FeatureCollection", "features": restricted_features},
        meta=meta,
    )
