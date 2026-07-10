"""Shared planar-geometry helpers.

Web Mercator (EPSG:3857) inflates linear scale by sec(lat) and area by sec²(lat) —
×1.8 at Rome, ×2.7 at Amsterdam. All metric helpers here project vectorized and then
correct by cos(lat) so returned values are true metres/km within <1% for spans ≤50 km.
"""

import math

from pyproj import Transformer
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform

to_meters = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
to_wgs84 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)


def _cos_lat(geom: BaseGeometry) -> float:
    return math.cos(math.radians(geom.centroid.y))


def mercator_scale(lat: float) -> float:
    """Metres in EPSG:3857 per true metre at *lat* (≥1)."""
    return 1.0 / math.cos(math.radians(lat))


def area_km2(geom: BaseGeometry) -> float:
    """True area in km² (handles MultiPolygon and interior holes)."""
    if geom.is_empty:
        return 0.0
    merc = transform(to_meters.transform, geom)
    return merc.area * _cos_lat(geom) ** 2 / 1e6


def length_km(geom: BaseGeometry) -> float:
    """True length in km."""
    if geom.is_empty:
        return 0.0
    merc = transform(to_meters.transform, geom)
    return merc.length * _cos_lat(geom) / 1000.0


def distance_km(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    """True distance in km between two WGS84 points."""
    x1, y1 = to_meters.transform(lng1, lat1)
    x2, y2 = to_meters.transform(lng2, lat2)
    cos_mid = math.cos(math.radians((lat1 + lat2) / 2.0))
    return math.hypot(x2 - x1, y2 - y1) * cos_mid / 1000.0
