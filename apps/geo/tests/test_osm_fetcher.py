from unittest.mock import patch

import networkx as nx
import pytest
import requests

from findthem_geo.services.osm_fetcher import (
    OSMData,
    _classify_land_use,
    _classify_restriction,
    _graph_from_cached,
    _graph_to_cacheable,
    _parse_land_use_to_polygons,
    _parse_overpass_to_polygons,
    fetch_osm_data,
)


class TestClassifyRestriction:
    def test_military_landuse(self):
        assert _classify_restriction({"landuse": "military"}) == "military"

    def test_military_tag(self):
        assert _classify_restriction({"military": "base"}) == "military"

    def test_prison(self):
        assert _classify_restriction({"amenity": "prison"}) == "prison"

    def test_aerodrome(self):
        assert _classify_restriction({"aeroway": "aerodrome"}) == "aerodrome"

    def test_private_access(self):
        assert _classify_restriction({"access": "private"}) == "private"

    def test_no_access(self):
        assert _classify_restriction({"access": "no"}) == "private"

    def test_unknown(self):
        assert _classify_restriction({"highway": "residential"}) == "unknown"


class TestParseOverpassToPolygons:
    def test_parses_closed_way(self):
        data = {
            "elements": [
                {"type": "node", "id": 1, "lat": 0.0, "lon": 0.0},
                {"type": "node", "id": 2, "lat": 0.0, "lon": 1.0},
                {"type": "node", "id": 3, "lat": 1.0, "lon": 1.0},
                {"type": "node", "id": 4, "lat": 1.0, "lon": 0.0},
                {
                    "type": "way",
                    "id": 100,
                    "nodes": [1, 2, 3, 4, 1],
                    "tags": {"landuse": "military", "name": "Test Base"},
                },
            ]
        }
        result = _parse_overpass_to_polygons(data)
        assert len(result) == 1
        assert result[0]["name"] == "Test Base"
        assert result[0]["restriction_type"] == "military"

    def test_skips_ways_with_too_few_nodes(self):
        data = {
            "elements": [
                {"type": "node", "id": 1, "lat": 0.0, "lon": 0.0},
                {"type": "node", "id": 2, "lat": 0.0, "lon": 1.0},
                {
                    "type": "way",
                    "id": 100,
                    "nodes": [1, 2],
                    "tags": {"landuse": "military"},
                },
            ]
        }
        result = _parse_overpass_to_polygons(data)
        assert len(result) == 0

    def test_empty_elements(self):
        result = _parse_overpass_to_polygons({"elements": []})
        assert result == []


class TestClassifyLandUse:
    def test_park(self):
        assert _classify_land_use({"leisure": "park"}) == "park"

    def test_forest_landuse(self):
        assert _classify_land_use({"landuse": "forest"}) == "park"

    def test_pedestrian(self):
        assert _classify_land_use({"highway": "pedestrian"}) == "pedestrian"

    def test_square(self):
        assert _classify_land_use({"place": "square"}) == "pedestrian"

    def test_water(self):
        assert _classify_land_use({"natural": "water"}) == "water"

    def test_farmland(self):
        assert _classify_land_use({"landuse": "farmland"}) == "farmland"

    def test_unknown(self):
        assert _classify_land_use({"highway": "residential"}) == "unknown"


class TestParseLandUseToPolygons:
    def test_parses_park_way(self):
        data = {
            "elements": [
                {"type": "node", "id": 1, "lat": 0.0, "lon": 0.0},
                {"type": "node", "id": 2, "lat": 0.0, "lon": 1.0},
                {"type": "node", "id": 3, "lat": 1.0, "lon": 1.0},
                {"type": "node", "id": 4, "lat": 1.0, "lon": 0.0},
                {
                    "type": "way",
                    "id": 100,
                    "nodes": [1, 2, 3, 4, 1],
                    "tags": {"leisure": "park", "name": "Villa Borghese"},
                },
            ]
        }
        result = _parse_land_use_to_polygons(data)
        assert len(result) == 1
        assert result[0]["name"] == "Villa Borghese"
        assert result[0]["land_use_type"] == "park"

    def test_skips_untagged_ways(self):
        data = {
            "elements": [
                {"type": "node", "id": 1, "lat": 0.0, "lon": 0.0},
                {"type": "node", "id": 2, "lat": 0.0, "lon": 1.0},
                {"type": "node", "id": 3, "lat": 1.0, "lon": 1.0},
                {"type": "node", "id": 4, "lat": 1.0, "lon": 0.0},
                {
                    "type": "way",
                    "id": 100,
                    "nodes": [1, 2, 3, 4, 1],
                    "tags": {"highway": "residential"},
                },
            ]
        }
        assert _parse_land_use_to_polygons(data) == []


class TestFetchOSMData:
    @patch("findthem_geo.services.osm_fetcher._fetch_land_use_areas")
    @patch("findthem_geo.services.osm_fetcher._fetch_restricted_areas")
    @patch("findthem_geo.services.osm_fetcher._fetch_road_graph")
    def test_returns_osm_data(self, mock_roads, mock_restricted, mock_land_use):
        mock_roads.return_value = nx.MultiDiGraph()
        mock_restricted.return_value = []
        mock_land_use.return_value = []
        result = fetch_osm_data(41.9028, 12.4964, 1.0)
        assert isinstance(result, OSMData)
        assert isinstance(result.road_graph, nx.MultiDiGraph)
        assert result.restricted_areas == []
        assert result.land_use_areas == []

    @patch("findthem_geo.services.osm_fetcher._fetch_land_use_areas")
    @patch("findthem_geo.services.osm_fetcher._fetch_restricted_areas")
    @patch("findthem_geo.services.osm_fetcher._fetch_road_graph")
    def test_handles_no_roads(self, mock_roads, mock_restricted, mock_land_use):
        mock_roads.return_value = None
        mock_restricted.return_value = []
        mock_land_use.return_value = []
        result = fetch_osm_data(41.9028, 12.4964, 1.0)
        assert result.road_graph is None


class TestGraphCacheRoundtrip:
    def test_simple_graph_roundtrip(self):
        """A graph without edge geometries survives serialization."""
        G = nx.MultiDiGraph()
        G.add_node(0, x=12.49, y=41.90)
        G.add_node(1, x=12.50, y=41.91)
        G.add_edge(0, 1, highway="residential")

        cached = _graph_to_cacheable(G)
        restored = _graph_from_cached(cached)

        assert restored.number_of_nodes() == 2
        assert restored.number_of_edges() == 1
        assert restored.nodes[0]["x"] == pytest.approx(12.49)
        assert restored.nodes[1]["y"] == pytest.approx(41.91)

    def test_graph_with_geometry_roundtrip(self):
        """Edge geometries (LineStrings) survive serialization."""
        from shapely.geometry import LineString

        G = nx.MultiDiGraph()
        G.add_node(0, x=12.49, y=41.90)
        G.add_node(1, x=12.50, y=41.91)
        line = LineString([(12.49, 41.90), (12.495, 41.905), (12.50, 41.91)])
        G.add_edge(0, 1, geometry=line)

        cached = _graph_to_cacheable(G)
        restored = _graph_from_cached(cached)

        edge_data = list(restored.edges(data=True))[0][2]
        assert isinstance(edge_data["geometry"], LineString)
        assert len(list(edge_data["geometry"].coords)) == 3

    def test_road_graph_cache_hit(self, monkeypatch, tmp_path):
        """_fetch_road_graph uses cached data on second call."""
        from findthem_geo.services import osm_fetcher

        monkeypatch.setattr("findthem_geo.cache.osm_cache.settings.osm_cache_dir", str(tmp_path))

        G = nx.MultiDiGraph()
        G.add_node(0, x=12.49, y=41.90)
        G.add_node(1, x=12.50, y=41.91)
        G.add_edge(0, 1, highway="residential")

        call_count = 0

        def mock_graph_from_point(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return G

        monkeypatch.setattr("osmnx.graph_from_point", mock_graph_from_point)

        # First call — hits OSM (mocked)
        result1 = osm_fetcher._fetch_road_graph(41.90, 12.49, 1000.0)
        assert result1 is not None
        assert call_count == 1

        # Second call — should use cache, not call osmnx again
        result2 = osm_fetcher._fetch_road_graph(41.90, 12.49, 1000.0)
        assert result2 is not None
        assert call_count == 1  # osmnx not called again
        assert result2.number_of_nodes() == 2


class TestTimeoutPropagation:
    def test_road_graph_timeout_propagates(self, monkeypatch):
        """requests.exceptions.Timeout from osmnx propagates up."""
        from findthem_geo.services import osm_fetcher

        monkeypatch.setattr(
            "findthem_geo.cache.osm_cache.get_cached", lambda *a: None
        )

        def raise_timeout(*args, **kwargs):
            raise requests.exceptions.Timeout("OSM timed out")

        monkeypatch.setattr("osmnx.graph_from_point", raise_timeout)

        with pytest.raises(requests.exceptions.Timeout):
            osm_fetcher._fetch_road_graph(41.90, 12.49, 1000.0)

    def test_restricted_areas_timeout_propagates(self, monkeypatch):
        """requests.exceptions.Timeout from Overpass propagates up."""
        from findthem_geo.services import osm_fetcher

        monkeypatch.setattr(
            "findthem_geo.cache.osm_cache.get_cached", lambda *a: None
        )

        def raise_timeout(*args, **kwargs):
            raise requests.exceptions.Timeout("Overpass timed out")

        monkeypatch.setattr("requests.post", raise_timeout)

        with pytest.raises(requests.exceptions.Timeout):
            osm_fetcher._fetch_restricted_areas(41.90, 12.49, 1000.0)
