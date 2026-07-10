import logging
import socket
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import networkx as nx
import osmnx as ox
import requests
import urllib3.util.connection as _urllib3_conn
from shapely.geometry import Polygon

from findthem_geo.cache.osm_cache import cache_key, get_cached, set_cached
from findthem_geo.config import settings
from findthem_geo.models.domain import LandUseArea, RestrictedArea

logger = logging.getLogger(__name__)

# overpass-api.de blocks IPv4 from Google Cloud IP ranges (connect timeouts) but serves
# fine over IPv6, and Cloud Run has IPv6 egress. Force IPv6 so osmnx and our requests
# calls (both via urllib3) take the working path. Disable on IPv4-only hosts.
if settings.overpass_force_ipv6:
    _urllib3_conn.allowed_gai_family = lambda: socket.AF_INET6

# Overpass endpoint (configurable via GEO_OVERPASS_URL). osmnx wants the base URL (it
# appends /interpreter); our restricted-area query needs the full interpreter URL.
ox.settings.overpass_url = settings.overpass_url
_OVERPASS_URL = f"{settings.overpass_url}/interpreter"

ox.settings.requests_timeout = settings.osm_request_timeout_s
# Polite rate limiting: osmnx checks the Overpass status endpoint and waits for a free
# slot instead of getting 429s. Keep it ON for public instances (default). It was only
# disabled to escape a Cloud-Run-specific IP-block hang, which does not apply elsewhere.
ox.settings.overpass_rate_limit = settings.overpass_rate_limit

_RESTRICTED_QUERY_TEMPLATE = """
[out:json][timeout:30];
(
  way["landuse"="military"](around:{radius},{lat},{lng});
  relation["landuse"="military"](around:{radius},{lat},{lng});
  way["military"](around:{radius},{lat},{lng});
  relation["military"](around:{radius},{lat},{lng});
  way["amenity"="prison"](around:{radius},{lat},{lng});
  relation["amenity"="prison"](around:{radius},{lat},{lng});
  way["aeroway"="aerodrome"](around:{radius},{lat},{lng});
  relation["aeroway"="aerodrome"](around:{radius},{lat},{lng});
  way["access"="private"](around:{radius},{lat},{lng});
  way["access"="no"](around:{radius},{lat},{lng});
);
out body;
>;
out skel qt;
"""


# Land use that vehicles (cars/motorbikes) cannot drive into. These areas remain
# searchable on foot / by drone — only vehicle *assignment* is blocked.
_LAND_USE_QUERY_TEMPLATE = """
[out:json][timeout:30];
(
  way["leisure"~"^(park|garden|nature_reserve)$"](around:{radius},{lat},{lng});
  relation["leisure"~"^(park|garden|nature_reserve)$"](around:{radius},{lat},{lng});
  way["landuse"~"^(recreation_ground|grass|forest|meadow)$"](around:{radius},{lat},{lng});
  relation["landuse"~"^(recreation_ground|grass|forest|meadow)$"](around:{radius},{lat},{lng});
  way["natural"~"^(wood|water|wetland)$"](around:{radius},{lat},{lng});
  relation["natural"~"^(wood|water|wetland)$"](around:{radius},{lat},{lng});
  way["highway"="pedestrian"]["area"="yes"](around:{radius},{lat},{lng});
  way["place"="square"](around:{radius},{lat},{lng});
  way["landuse"="reservoir"](around:{radius},{lat},{lng});
  way["landuse"~"^(farmland|orchard|vineyard)$"](around:{radius},{lat},{lng});
  relation["landuse"~"^(farmland|orchard|vineyard)$"](around:{radius},{lat},{lng});
);
out body;
>;
out skel qt;
"""


@dataclass
class OSMData:
    road_graph: nx.MultiDiGraph | None = None
    restricted_areas: list[RestrictedArea] = field(default_factory=list)
    land_use_areas: list[LandUseArea] = field(default_factory=list)


def _graph_to_cacheable(graph: nx.MultiDiGraph) -> dict:
    """Convert an osmnx graph to a JSON-serializable dict.

    Operates on the node-link export, NOT the live graph — mutating the graph's edge
    geometries in place would corrupt the LineStrings the pipeline still needs.
    """
    data = nx.node_link_data(graph)
    edges = data.get("links") or data.get("edges") or []
    for link in edges:
        geom = link.get("geometry")
        if geom is not None and hasattr(geom, "coords"):
            link["geometry"] = list(geom.coords)
    return data


def _graph_from_cached(data: dict) -> nx.MultiDiGraph:
    """Reconstruct an osmnx graph from cached node-link data."""
    from shapely.geometry import LineString

    graph = nx.node_link_graph(data, directed=True, multigraph=True)
    for _u, _v, edge_data in graph.edges(data=True):
        if "geometry" in edge_data and isinstance(edge_data["geometry"], list):
            edge_data["geometry"] = LineString(edge_data["geometry"])
    return graph


def _fetch_road_graph(lat: float, lng: float, radius_m: float) -> nx.MultiDiGraph | None:
    """Fetch road network from OSM via osmnx."""
    key = cache_key(lat, lng, radius_m, "roads")
    cached = get_cached(key)
    if cached is not None:
        try:
            return _graph_from_cached(cached)
        except Exception:
            logger.warning("Failed to restore cached road graph, re-fetching")

    last_exc: Exception | None = None
    for attempt in range(settings.osm_retries):
        try:
            graph = ox.graph_from_point((lat, lng), dist=radius_m, network_type="all")
            try:
                set_cached(key, _graph_to_cacheable(graph))
            except Exception:
                logger.debug("Failed to cache road graph (non-critical)")
            return graph
        except requests.exceptions.Timeout:
            raise
        except Exception as exc:
            last_exc = exc
            if attempt + 1 < settings.osm_retries:
                time.sleep(1.5 * (attempt + 1))
    logger.warning(
        "No road network found for (%.4f, %.4f, %.0fm) after %d attempts: %s: %s",
        lat, lng, radius_m, settings.osm_retries, type(last_exc).__name__, last_exc,
    )
    return None


def _parse_overpass_to_polygons(data: dict) -> list[dict]:
    """Parse Overpass JSON into polygon geometries with metadata."""
    elements = data.get("elements", [])

    nodes: dict[int, tuple[float, float]] = {}
    ways: dict[int, dict] = {}

    for el in elements:
        if el["type"] == "node":
            nodes[el["id"]] = (el["lon"], el["lat"])
        elif el["type"] == "way":
            ways[el["id"]] = el

    result = []
    for way_id, way in ways.items():
        node_ids = way.get("nodes", [])
        if len(node_ids) < 4:
            continue
        coords = [nodes[nid] for nid in node_ids if nid in nodes]
        if len(coords) < 4:
            continue
        # Ensure ring is closed
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        try:
            poly = Polygon(coords)
            if poly.is_valid and not poly.is_empty:
                tags = way.get("tags", {})
                rtype = _classify_restriction(tags)
                result.append(
                    {
                        "name": tags.get("name", ""),
                        "restriction_type": rtype,
                        "coords": list(poly.exterior.coords),
                    }
                )
        except Exception:
            continue

    return result


def _classify_restriction(tags: dict) -> str:
    if tags.get("landuse") == "military" or "military" in tags:
        return "military"
    if tags.get("amenity") == "prison":
        return "prison"
    if tags.get("aeroway") == "aerodrome":
        return "aerodrome"
    if tags.get("access") in ("private", "no"):
        return "private"
    return "unknown"


def _classify_land_use(tags: dict) -> str:
    """Map OSM tags to a no-car land-use category."""
    leisure = tags.get("leisure")
    landuse = tags.get("landuse")
    natural = tags.get("natural")
    if (
        leisure in ("park", "garden", "nature_reserve")
        or landuse in ("recreation_ground", "grass", "forest", "meadow")
        or natural == "wood"
    ):
        return "park"
    if tags.get("highway") == "pedestrian" or tags.get("place") == "square":
        return "pedestrian"
    if natural in ("water", "wetland") or landuse == "reservoir":
        return "water"
    if landuse in ("farmland", "orchard", "vineyard"):
        return "farmland"
    return "unknown"


def _parse_land_use_to_polygons(data: dict) -> list[dict]:
    """Parse Overpass JSON into no-car land-use polygons with metadata."""
    elements = data.get("elements", [])

    nodes: dict[int, tuple[float, float]] = {}
    ways: dict[int, dict] = {}
    for el in elements:
        if el["type"] == "node":
            nodes[el["id"]] = (el["lon"], el["lat"])
        elif el["type"] == "way":
            ways[el["id"]] = el

    result = []
    for way in ways.values():
        node_ids = way.get("nodes", [])
        coords = [nodes[nid] for nid in node_ids if nid in nodes]
        if len(coords) < 4:
            continue
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        try:
            poly = Polygon(coords)
        except Exception:
            continue
        if not poly.is_valid or poly.is_empty:
            continue
        tags = way.get("tags", {})
        lu_type = _classify_land_use(tags)
        if lu_type == "unknown":
            continue
        result.append(
            {
                "name": tags.get("name", ""),
                "land_use_type": lu_type,
                "coords": list(poly.exterior.coords),
            }
        )
    return result


def _fetch_land_use_areas(lat: float, lng: float, radius_m: float) -> list[LandUseArea]:
    """Fetch no-car land-use polygons (park/pedestrian/water/farmland) from Overpass."""
    key = cache_key(lat, lng, radius_m, "landuse")
    cached = get_cached(key)
    if cached is not None:
        return [
            LandUseArea(
                name=item["name"],
                land_use_type=item["land_use_type"],
                polygon=Polygon(item["coords"]),
            )
            for item in cached
        ]

    query = _LAND_USE_QUERY_TEMPLATE.format(lat=lat, lng=lng, radius=radius_m)
    data = None
    last_exc: Exception | None = None
    for attempt in range(settings.osm_retries):
        try:
            resp = requests.post(
                _OVERPASS_URL,
                data={"data": query},
                timeout=settings.osm_request_timeout_s,
                headers={"User-Agent": "findthem-geo/0.1 (search-and-rescue coordination)"},
            )
            resp.raise_for_status()
            data = resp.json()
            break
        except requests.exceptions.Timeout:
            raise
        except Exception as exc:
            last_exc = exc
            if attempt + 1 < settings.osm_retries:
                time.sleep(1.5 * (attempt + 1))
    if data is None:
        logger.warning(
            "Overpass land-use query failed for (%.4f, %.4f) after %d attempts: %s: %s",
            lat, lng, settings.osm_retries, type(last_exc).__name__, last_exc,
        )
        return []

    parsed = _parse_land_use_to_polygons(data)
    set_cached(key, parsed)

    return [
        LandUseArea(
            name=item["name"],
            land_use_type=item["land_use_type"],
            polygon=Polygon(item["coords"]),
        )
        for item in parsed
    ]


def _fetch_restricted_areas(lat: float, lng: float, radius_m: float) -> list[RestrictedArea]:
    """Fetch restricted area polygons from Overpass API."""
    key = cache_key(lat, lng, radius_m, "restricted")
    cached = get_cached(key)
    if cached is not None:
        areas = []
        for item in cached:
            poly = Polygon(item["coords"])
            areas.append(
                RestrictedArea(
                    name=item["name"],
                    restriction_type=item["restriction_type"],
                    polygon=poly,
                )
            )
        return areas

    query = _RESTRICTED_QUERY_TEMPLATE.format(lat=lat, lng=lng, radius=radius_m)
    data = None
    last_exc: Exception | None = None
    for attempt in range(settings.osm_retries):
        try:
            resp = requests.post(
                _OVERPASS_URL,
                data={"data": query},
                timeout=settings.osm_request_timeout_s,
                headers={"User-Agent": "findthem-geo/0.1 (search-and-rescue coordination)"},
            )
            resp.raise_for_status()
            data = resp.json()
            break
        except requests.exceptions.Timeout:
            raise
        except Exception as exc:
            last_exc = exc
            if attempt + 1 < settings.osm_retries:
                time.sleep(1.5 * (attempt + 1))
    if data is None:
        logger.warning(
            "Overpass query failed for (%.4f, %.4f) after %d attempts: %s: %s",
            lat, lng, settings.osm_retries, type(last_exc).__name__, last_exc,
        )
        return []

    parsed = _parse_overpass_to_polygons(data)
    set_cached(key, parsed)

    return [
        RestrictedArea(
            name=item["name"],
            restriction_type=item["restriction_type"],
            polygon=Polygon(item["coords"]),
        )
        for item in parsed
    ]


def fetch_osm_data(lat: float, lng: float, radius_km: float) -> OSMData:
    """Fetch roads, restricted areas, and land use concurrently for center + radius."""
    radius_m = radius_km * 1000
    with ThreadPoolExecutor(max_workers=3) as pool:
        f_roads = pool.submit(_fetch_road_graph, lat, lng, radius_m)
        f_restricted = pool.submit(_fetch_restricted_areas, lat, lng, radius_m)
        f_land_use = pool.submit(_fetch_land_use_areas, lat, lng, radius_m)
        return OSMData(
            road_graph=f_roads.result(),
            restricted_areas=f_restricted.result(),
            land_use_areas=f_land_use.result(),
        )
