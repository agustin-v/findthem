import h3
from shapely.geometry import Point

from findthem_geo.services.h3_grid import generate_h3_grid, h3_cell_to_polygon


class TestH3CellToPolygon:
    def test_returns_valid_polygon(self):
        cell = h3.latlng_to_cell(41.9028, 12.4964, 9)
        polygon = h3_cell_to_polygon(cell)
        assert polygon.is_valid
        assert not polygon.is_empty

    def test_polygon_is_closed_ring(self):
        cell = h3.latlng_to_cell(41.9028, 12.4964, 9)
        polygon = h3_cell_to_polygon(cell)
        coords = list(polygon.exterior.coords)
        assert coords[0] == coords[-1], "Polygon ring must be closed"

    def test_polygon_has_correct_vertex_count(self):
        """H3 cells are hexagons (6 vertices) or pentagons (5 vertices)."""
        cell = h3.latlng_to_cell(41.9028, 12.4964, 9)
        polygon = h3_cell_to_polygon(cell)
        # Closed ring: 6 vertices + closing = 7, or 5+1=6 for pentagons
        num_coords = len(list(polygon.exterior.coords))
        assert num_coords in (6, 7)

    def test_polygon_contains_cell_center(self):
        lat, lng = 41.9028, 12.4964
        cell = h3.latlng_to_cell(lat, lng, 9)
        polygon = h3_cell_to_polygon(cell)
        cell_lat, cell_lng = h3.cell_to_latlng(cell)
        center = Point(cell_lng, cell_lat)
        assert polygon.contains(center)


class TestGenerateH3Grid:
    def test_returns_nonempty_list(self):
        cells = generate_h3_grid(41.9028, 12.4964, 1.0, 9)
        assert len(cells) > 0

    def test_center_cell_is_included(self):
        lat, lng = 41.9028, 12.4964
        cells = generate_h3_grid(lat, lng, 1.0, 9)
        center_cell = h3.latlng_to_cell(lat, lng, 9)
        h3_indices = {c.h3_index for c in cells}
        assert center_cell in h3_indices

    def test_all_cells_have_valid_polygons(self):
        cells = generate_h3_grid(41.9028, 12.4964, 1.0, 9)
        for cell in cells:
            assert cell.polygon.is_valid
            assert not cell.polygon.is_empty

    def test_all_cells_default_to_open_status(self):
        cells = generate_h3_grid(41.9028, 12.4964, 1.0, 9)
        for cell in cells:
            assert cell.status == "open"
            assert cell.restricted_fraction == 0.0
            assert cell.segment_id is None

    def test_larger_radius_produces_more_cells(self):
        small = generate_h3_grid(41.9028, 12.4964, 0.5, 9)
        large = generate_h3_grid(41.9028, 12.4964, 2.0, 9)
        assert len(large) > len(small)

    def test_higher_resolution_produces_more_cells(self):
        low_res = generate_h3_grid(41.9028, 12.4964, 1.0, 7)
        high_res = generate_h3_grid(41.9028, 12.4964, 1.0, 9)
        assert len(high_res) > len(low_res)

    def test_all_indices_are_valid_h3(self):
        cells = generate_h3_grid(41.9028, 12.4964, 1.0, 9)
        for cell in cells:
            assert h3.is_valid_cell(cell.h3_index)

    def test_no_duplicate_cells(self):
        cells = generate_h3_grid(41.9028, 12.4964, 1.0, 9)
        indices = [c.h3_index for c in cells]
        assert len(indices) == len(set(indices))
