import h3
from shapely.geometry import Polygon

from findthem_geo.models.domain import H3Cell


def h3_cell_to_polygon(h3_index: str) -> Polygon:
    """Convert an H3 index to a shapely Polygon."""
    boundary = h3.cell_to_boundary(h3_index)
    # h3 returns (lat, lng) pairs; shapely needs (lng, lat)
    coords = [(lng, lat) for lat, lng in boundary]
    coords.append(coords[0])  # close the ring
    return Polygon(coords)


def generate_h3_grid(lat: float, lng: float, radius_km: float, resolution: int) -> list[H3Cell]:
    """Generate H3 cells covering a circle defined by center + radius."""
    center_cell = h3.latlng_to_cell(lat, lng, resolution)
    # Same source as the request validator's cell-budget estimate — keep in sync.
    edge_km = h3.average_hexagon_edge_length(resolution, unit="km")
    k = max(1, int(radius_km / edge_km) + 1)
    cells = h3.grid_disk(center_cell, k)

    result: list[H3Cell] = []
    for h3_index in cells:
        polygon = h3_cell_to_polygon(h3_index)
        result.append(H3Cell(h3_index=h3_index, polygon=polygon))

    return result
