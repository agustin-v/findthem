import h3
from pydantic import BaseModel, Field, model_validator

from findthem_geo.config import settings


class LatLng(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class Resource(BaseModel):
    type: str = "people"
    count: int = Field(ge=1)


class GenerateSegmentsRequest(BaseModel):
    center: LatLng
    radius_km: float = Field(gt=0, le=50)
    h3_resolution: int = Field(default=9, ge=4, le=12)
    resources: list[Resource] = Field(default_factory=lambda: [Resource(type="people", count=4)])

    @model_validator(mode="after")
    def _check_cell_budget(self) -> "GenerateSegmentsRequest":
        """Reject radius/resolution combos that would generate an unbounded grid.

        Mirrors the k-ring sizing in ``generate_h3_grid`` so the estimate matches
        what the pipeline would actually build, and fails fast with a 422 before
        any OSM fetch happens.
        """
        edge_km = h3.average_hexagon_edge_length(self.h3_resolution, unit="km")
        k = max(1, int(self.radius_km / edge_km) + 1)
        estimated_cells = 3 * k * (k + 1) + 1
        if estimated_cells > settings.max_h3_cells:
            raise ValueError(
                f"Requested area would generate ~{estimated_cells:,} H3 cells "
                f"(limit {settings.max_h3_cells:,}). Reduce radius_km or h3_resolution."
            )
        return self
