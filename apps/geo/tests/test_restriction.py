import h3
import pytest
from shapely.geometry import Polygon, box

from findthem_geo.models.domain import H3Cell, RestrictedArea
from findthem_geo.services.h3_grid import h3_cell_to_polygon
from findthem_geo.services.restriction import classify_cells


def _make_cell(lat: float, lng: float, resolution: int = 9) -> H3Cell:
    idx = h3.latlng_to_cell(lat, lng, resolution)
    return H3Cell(h3_index=idx, polygon=h3_cell_to_polygon(idx))


class TestClassifyCells:
    def test_no_restricted_areas_all_open(self):
        cells = [_make_cell(41.9028, 12.4964)]
        result = classify_cells(cells, [])
        assert result[0].status == "open"
        assert result[0].restricted_fraction == 0.0

    def test_cell_fully_inside_restricted_area(self):
        cell = _make_cell(41.9028, 12.4964)
        # Create a large restricted area that fully contains the cell
        big_box = box(12.0, 41.0, 13.0, 42.0)
        restricted = RestrictedArea(
            name="Military Zone",
            restriction_type="military",
            polygon=big_box,
        )
        result = classify_cells([cell], [restricted])
        assert result[0].status == "restricted"
        assert result[0].restricted_fraction == 1.0

    def test_cell_partially_overlapping(self):
        cell = _make_cell(41.9028, 12.4964)
        # Create restricted area that partially overlaps
        bounds = cell.polygon.bounds  # (minx, miny, maxx, maxy)
        mid_x = (bounds[0] + bounds[2]) / 2
        partial_box = box(mid_x, bounds[1], bounds[2] + 0.01, bounds[3] + 0.01)
        restricted = RestrictedArea(
            name="Partial Zone",
            restriction_type="private",
            polygon=partial_box,
        )
        result = classify_cells([cell], [restricted])
        assert result[0].status == "partial"
        assert 0.05 < result[0].restricted_fraction < 0.95

    def test_cell_outside_restricted_area(self):
        cell = _make_cell(41.9028, 12.4964)
        # Restricted area far away
        far_box = box(20.0, 50.0, 21.0, 51.0)
        restricted = RestrictedArea(
            name="Far Zone",
            restriction_type="military",
            polygon=far_box,
        )
        result = classify_cells([cell], [restricted])
        assert result[0].status == "open"
        assert result[0].restricted_fraction == 0.0

    def test_multiple_cells_mixed_classification(self):
        cell_inside = _make_cell(41.9028, 12.4964)
        cell_outside = _make_cell(41.9200, 12.5200)
        big_box = box(12.0, 41.0, 12.5, 41.91)
        restricted = RestrictedArea(
            name="Zone",
            restriction_type="military",
            polygon=big_box,
        )
        result = classify_cells([cell_inside, cell_outside], [restricted])
        assert result[0].status == "restricted"
        assert result[1].status == "open"

    def test_does_not_modify_original_h3_index(self):
        cell = _make_cell(41.9028, 12.4964)
        original_index = cell.h3_index
        big_box = box(12.0, 41.0, 13.0, 42.0)
        restricted = RestrictedArea(
            name="Zone",
            restriction_type="military",
            polygon=big_box,
        )
        result = classify_cells([cell], [restricted])
        assert result[0].h3_index == original_index
