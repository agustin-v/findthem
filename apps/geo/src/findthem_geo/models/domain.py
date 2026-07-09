from typing import Union

from pydantic import BaseModel
from shapely.geometry import MultiPolygon, Polygon


class H3Cell(BaseModel):
    model_config = {"arbitrary_types_allowed": True}

    h3_index: str
    polygon: Polygon
    status: str = "open"  # "open" | "partial" | "restricted"
    restricted_fraction: float = 0.0
    segment_id: int | None = None


class RestrictedArea(BaseModel):
    model_config = {"arbitrary_types_allowed": True}

    name: str = ""
    restriction_type: str = ""  # "military" | "prison" | "aerodrome" | "private"
    polygon: Polygon


class LandUseArea(BaseModel):
    """A land-use polygon that vehicles (cars/motorbikes) cannot enter.

    Still searchable on foot/by drone — only vehicle assignment is blocked.
    """

    model_config = {"arbitrary_types_allowed": True}

    name: str = ""
    land_use_type: str = ""  # "park" | "pedestrian" | "water" | "farmland"
    polygon: Polygon


class Segment(BaseModel):
    model_config = {"arbitrary_types_allowed": True}

    segment_id: int
    polygon: Union[Polygon, MultiPolygon]
    cells: list[str] = []  # H3 indices
    total_area_km2: float = 0.0
    effective_area_km2: float = 0.0
    workload: float = 0.0
    road_density: float = 0.0  # km of road per km² within segment
    vehicle_accessible: bool = True  # derived from road_density vs threshold
    assigned_resource_type: str | None = None  # e.g. "people", "cars"
    searchable: bool = True  # False = fully inside restricted area
    estimated_hours: float = 0.0  # effective_area / speed
    priority: int = 0  # 1 = closest to LKP, 0 = not ranked
    lkp_distance_km: float = 0.0  # centroid distance to LKP
    entry_point: list[float] | None = None  # [lng, lat] nearest road node
