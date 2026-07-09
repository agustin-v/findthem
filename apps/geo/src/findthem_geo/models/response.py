from typing import Any

from pydantic import BaseModel


class SegmentsResponse(BaseModel):
    segments: dict[str, Any]  # GeoJSON FeatureCollection
    restricted_areas: dict[str, Any]  # GeoJSON FeatureCollection
    meta: dict[str, Any] = {}
