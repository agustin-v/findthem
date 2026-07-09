import h3
from shapely.geometry import Polygon

from findthem_geo.models.domain import H3Cell


# Average H3 edge lengths in km by resolution (approximate)
_H3_EDGE_LENGTH_KM: dict[int, float] = {
    0: 1107.712,
    1: 418.676,
    2: 158.244,
    3: 59.811,
    4: 22.606,
    5: 8.544,
    6: 3.229,
    7: 1.220,
    8: 0.461,
    9: 0.174,
    10: 0.066,
    11: 0.025,
    12: 0.009,
}


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
    edge_km = _H3_EDGE_LENGTH_KM.get(resolution, 0.174)
    k = max(1, int(radius_km / edge_km) + 1)
    cells = h3.grid_disk(center_cell, k)

    result: list[H3Cell] = []
    for h3_index in cells:
        polygon = h3_cell_to_polygon(h3_index)
        result.append(H3Cell(h3_index=h3_index, polygon=polygon))

    return result
