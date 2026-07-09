import logging

import networkx as nx
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, Point, Polygon
from shapely.ops import polygonize, unary_union

from findthem_geo.config import settings

logger = logging.getLogger(__name__)


def _make_search_boundary(lat: float, lng: float, radius_km: float) -> Polygon:
    """Create a circular search boundary polygon in WGS84."""
    # Project to meters, buffer, project back
    to_meters = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
    to_wgs84 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)

    center_m = to_meters.transform(lng, lat)
    circle_m = Point(center_m).buffer(radius_km * 1000, quad_segs=64)
    coords_wgs84 = [to_wgs84.transform(x, y) for x, y in circle_m.exterior.coords]
    return Polygon(coords_wgs84)


def _extract_road_lines(graph: nx.MultiDiGraph) -> list[LineString]:
    """Extract edge geometries from an osmnx road graph as LineStrings."""
    lines = []
    for u, v, data in graph.edges(data=True):
        geom = data.get("geometry")
        if isinstance(geom, LineString):
            lines.append(geom)
        else:
            # No (or non-geometry) edge geometry — straight line between nodes.
            u_data = graph.nodes[u]
            v_data = graph.nodes[v]
            line = LineString(
                [(u_data["x"], u_data["y"]), (v_data["x"], v_data["y"])]
            )
            lines.append(line)
    return lines


def build_road_polygons(
    graph: nx.MultiDiGraph | None,
    lat: float,
    lng: float,
    radius_km: float,
) -> list[Polygon]:
    """
    Build road-bounded polygons from a road network graph.

    The search radius is treated as a *guide*, not a hard border: a road-bounded block
    that is **mostly** inside the radius (majority of its area) is kept **whole**
    (extending past the circle to its surrounding roads), so the border follows the road
    network instead of a clean arc. Blocks mostly outside the radius are dropped — this
    keeps the search area close to the requested size instead of sprawling out to the
    edge of the fetched road data.

    Steps:
    1. Extract road edge geometries as LineStrings
    2. Polygonize the road network alone into enclosed faces (city blocks). No boundary
       ring is added: a ring at the fetched-data bbox would create huge peripheral faces.
    3. Keep faces whose majority area falls inside the search circle, whole; drop slivers
    """
    boundary = _make_search_boundary(lat, lng, radius_km)

    if graph is None or graph.number_of_edges() == 0:
        logger.info("No roads found — using entire search area as single segment")
        return [boundary]

    road_lines = _extract_road_lines(graph)
    merged = unary_union(MultiLineString(road_lines))
    faces = list(polygonize(merged))

    if not faces:
        logger.info("Polygonize produced no faces — using entire search area")
        return [boundary]

    min_area_m2 = settings.min_segment_area_m2
    keep_fraction = settings.block_keep_fraction

    # Project to meters for area check
    to_meters = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)

    result = []
    for face in faces:
        if not isinstance(face, Polygon) or face.is_empty:
            continue
        inside = face.intersection(boundary)
        if inside.is_empty:
            continue
        # Keep the whole block only if the majority of it lies within the radius.
        if inside.area < keep_fraction * face.area:
            continue
        # Check area in meters²
        coords_m = [to_meters.transform(x, y) for x, y in face.exterior.coords]
        area_m2 = Polygon(coords_m).area
        if area_m2 < min_area_m2:
            continue
        result.append(face)

    if not result:
        return [boundary]

    return result
