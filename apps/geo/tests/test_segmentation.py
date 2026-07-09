import h3
import pytest
from shapely.geometry import Polygon, box

from findthem_geo.models.domain import H3Cell, Segment
from findthem_geo.services.h3_grid import h3_cell_to_polygon
from findthem_geo.services.segmentation import assign_cells_to_segments


def _make_cell(lat: float, lng: float, resolution: int = 9) -> H3Cell:
    idx = h3.latlng_to_cell(lat, lng, resolution)
    return H3Cell(h3_index=idx, polygon=h3_cell_to_polygon(idx))


class TestAssignCellsToSegments:
    def test_no_polygons_returns_single_segment(self):
        cells = [_make_cell(41.9028, 12.4964)]
        segments = assign_cells_to_segments(cells, [])
        assert len(segments) == 1
        assert len(segments[0].cells) == 1

    def test_single_polygon_gets_all_cells(self):
        cells = [_make_cell(41.9028, 12.4964), _make_cell(41.9030, 12.4966)]
        big_poly = box(12.0, 41.0, 13.0, 42.0)
        segments = assign_cells_to_segments(cells, [big_poly])
        total_assigned = sum(len(s.cells) for s in segments)
        assert total_assigned == len(cells)

    def test_two_polygons_split_cells(self):
        # Two cells in clearly different areas
        cell_left = _make_cell(41.905, 12.490)
        cell_right = _make_cell(41.905, 12.510)

        poly_left = box(12.480, 41.900, 12.500, 41.910)
        poly_right = box(12.500, 41.900, 12.520, 41.910)

        segments = assign_cells_to_segments(
            [cell_left, cell_right],
            [poly_left, poly_right],
        )
        assert len(segments) == 2
        total_assigned = sum(len(s.cells) for s in segments)
        assert total_assigned == 2

    def test_all_cells_are_assigned(self):
        """Every cell must end up in exactly one segment."""
        cells = [
            _make_cell(41.903, 12.495),
            _make_cell(41.904, 12.496),
            _make_cell(41.905, 12.497),
        ]
        poly = box(12.490, 41.900, 12.500, 41.910)
        segments = assign_cells_to_segments(cells, [poly])
        all_assigned = []
        for s in segments:
            all_assigned.extend(s.cells)
        assert len(all_assigned) == len(cells)

    def test_cells_assigned_to_correct_segment(self):
        cell = _make_cell(41.905, 12.495)
        poly_containing = box(12.490, 41.900, 12.500, 41.910)
        poly_far = box(12.600, 42.000, 12.610, 42.010)

        segments = assign_cells_to_segments([cell], [poly_containing, poly_far])
        # Cell should be in segment 0 (the containing one)
        assert cell.h3_index in segments[0].cells

    def test_segment_ids_are_sequential(self):
        cells = [_make_cell(41.905, 12.495)]
        polys = [
            box(12.490, 41.900, 12.500, 41.910),
            box(12.500, 41.900, 12.510, 41.910),
        ]
        segments = assign_cells_to_segments(cells, polys)
        ids = [s.segment_id for s in segments]
        assert ids == list(range(len(polys)))

    def test_unassigned_cell_goes_to_nearest(self):
        """A cell whose centroid is outside all polygons goes to nearest."""
        cell = _make_cell(41.905, 12.530)  # Outside both polys
        poly_near = box(12.520, 41.900, 12.525, 41.910)
        poly_far = box(12.490, 41.900, 12.495, 41.910)

        segments = assign_cells_to_segments([cell], [poly_near, poly_far])
        total_assigned = sum(len(s.cells) for s in segments)
        assert total_assigned == 1
        # Should be assigned to poly_near (index 0)
        assert cell.h3_index in segments[0].cells
