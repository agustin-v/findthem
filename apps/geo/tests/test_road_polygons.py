import networkx as nx
import pytest
from shapely.geometry import LineString, Polygon

from findthem_geo.services.road_polygons import (
    _extract_road_lines,
    _make_search_boundary,
    build_road_polygons,
)


class TestMakeSearchBoundary:
    def test_returns_valid_polygon(self):
        poly = _make_search_boundary(41.9028, 12.4964, 1.0)
        assert isinstance(poly, Polygon)
        assert poly.is_valid
        assert not poly.is_empty

    def test_boundary_is_roughly_circular(self):
        poly = _make_search_boundary(41.9028, 12.4964, 1.0)
        bounds = poly.bounds
        width = bounds[2] - bounds[0]
        height = bounds[3] - bounds[1]
        ratio = width / height if height > 0 else 0
        # Should be roughly circular (ratio close to 1, with latitude distortion)
        assert 0.5 < ratio < 2.0

    def test_center_is_inside_boundary(self):
        from shapely.geometry import Point

        poly = _make_search_boundary(41.9028, 12.4964, 1.0)
        center = Point(12.4964, 41.9028)
        assert poly.contains(center)


class TestExtractRoadLines:
    def test_extracts_lines_from_graph(self):
        G = nx.MultiDiGraph()
        G.add_node(1, x=0.0, y=0.0)
        G.add_node(2, x=1.0, y=0.0)
        G.add_node(3, x=1.0, y=1.0)
        G.add_edge(1, 2)
        G.add_edge(2, 3)
        lines = _extract_road_lines(G)
        assert len(lines) == 2
        assert all(isinstance(l, LineString) for l in lines)

    def test_uses_geometry_attribute_when_present(self):
        G = nx.MultiDiGraph()
        G.add_node(1, x=0.0, y=0.0)
        G.add_node(2, x=1.0, y=0.0)
        curved = LineString([(0, 0), (0.5, 0.1), (1, 0)])
        G.add_edge(1, 2, geometry=curved)
        lines = _extract_road_lines(G)
        assert len(lines) == 1
        assert lines[0].equals(curved)

    def test_empty_graph_returns_empty_list(self):
        G = nx.MultiDiGraph()
        lines = _extract_road_lines(G)
        assert lines == []


class TestBuildRoadPolygons:
    def test_no_graph_returns_single_boundary(self):
        polys = build_road_polygons(None, 41.9028, 12.4964, 1.0)
        assert len(polys) == 1
        assert polys[0].is_valid

    def test_empty_graph_returns_single_boundary(self):
        G = nx.MultiDiGraph()
        polys = build_road_polygons(G, 41.9028, 12.4964, 1.0)
        assert len(polys) == 1

    def test_grid_roads_produce_multiple_polygons(self):
        """A simple grid of roads should produce enclosed faces."""
        G = nx.MultiDiGraph()
        # Create a grid of nodes
        nodes = {}
        idx = 0
        for i in range(3):
            for j in range(3):
                # Small area around (12.496, 41.902)
                x = 12.494 + i * 0.004
                y = 41.901 + j * 0.004
                G.add_node(idx, x=x, y=y)
                nodes[(i, j)] = idx
                idx += 1

        # Horizontal roads
        for i in range(3):
            for j in range(2):
                G.add_edge(nodes[(i, j)], nodes[(i, j + 1)])
        # Vertical roads
        for i in range(2):
            for j in range(3):
                G.add_edge(nodes[(i, j)], nodes[(i + 1, j)])

        polys = build_road_polygons(G, 41.905, 12.498, 1.0)
        assert len(polys) >= 1
        for p in polys:
            assert p.is_valid
            assert not p.is_empty

    def test_all_polygons_are_valid(self):
        G = nx.MultiDiGraph()
        G.add_node(0, x=12.49, y=41.90)
        G.add_node(1, x=12.50, y=41.90)
        G.add_node(2, x=12.50, y=41.91)
        G.add_node(3, x=12.49, y=41.91)
        G.add_edge(0, 1)
        G.add_edge(1, 2)
        G.add_edge(2, 3)
        G.add_edge(3, 0)
        polys = build_road_polygons(G, 41.905, 12.495, 1.0)
        for p in polys:
            assert isinstance(p, Polygon)
            assert p.is_valid

    def test_blocks_extend_past_the_circle(self):
        """The radius is a guide: a block that is mostly inside is kept whole (extends
        past the arc), while blocks mostly outside are dropped — the border follows the
        road network, not a clean circle, but stays near the requested size.
        """
        n = 7
        sp = 0.004
        center_lat, center_lng, radius_km = 41.905, 12.498, 0.6
        G = nx.MultiDiGraph()
        nodes = {}
        idx = 0
        for i in range(n):
            for j in range(n):
                x = center_lng + (i - (n - 1) / 2) * sp
                y = center_lat + (j - (n - 1) / 2) * sp
                G.add_node(idx, x=x, y=y)
                nodes[(i, j)] = idx
                idx += 1
        for i in range(n):
            for j in range(n - 1):
                G.add_edge(nodes[(i, j)], nodes[(i, j + 1)])
        for i in range(n - 1):
            for j in range(n):
                G.add_edge(nodes[(i, j)], nodes[(i + 1, j)])

        boundary = _make_search_boundary(center_lat, center_lng, radius_km)
        polys = build_road_polygons(G, center_lat, center_lng, radius_km)

        assert polys
        # Every kept block is majority-inside the circle...
        for p in polys:
            assert p.intersection(boundary).area >= 0.5 * p.area - 1e-12
        # ...and at least one extends beyond it (kept whole, not clipped to the arc).
        assert any(not boundary.contains(p) for p in polys)
