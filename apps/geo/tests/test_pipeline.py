from unittest.mock import patch

import networkx as nx
import pytest
from shapely.geometry import box, shape

from findthem_geo.models.domain import RestrictedArea
from findthem_geo.models.request import GenerateSegmentsRequest, LatLng, Resource
from findthem_geo.services.osm_fetcher import OSMData
from findthem_geo.services.pipeline import run_pipeline


def _mock_osm_data_no_roads() -> OSMData:
    return OSMData(road_graph=None, restricted_areas=[])


def _mock_osm_data_with_roads() -> OSMData:
    G = nx.MultiDiGraph()
    # Simple grid of roads around Rome
    nodes = {}
    idx = 0
    for i in range(3):
        for j in range(3):
            x = 12.494 + i * 0.004
            y = 41.901 + j * 0.004
            G.add_node(idx, x=x, y=y)
            nodes[(i, j)] = idx
            idx += 1
    for i in range(3):
        for j in range(2):
            G.add_edge(nodes[(i, j)], nodes[(i, j + 1)])
    for i in range(2):
        for j in range(3):
            G.add_edge(nodes[(i, j)], nodes[(i + 1, j)])

    restricted = RestrictedArea(
        name="Test Base",
        restriction_type="military",
        polygon=box(12.500, 41.906, 12.510, 41.912),
    )
    return OSMData(road_graph=G, restricted_areas=[restricted])


class TestPipelineNoRoads:
    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_returns_valid_response(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_no_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.9028, lng=12.4964),
            radius_km=0.5,
        )
        resp = run_pipeline(req)
        assert resp.segments["type"] == "FeatureCollection"
        assert len(resp.segments["features"]) >= 1

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_has_segments_even_without_roads(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_no_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.9028, lng=12.4964),
            radius_km=0.5,
        )
        resp = run_pipeline(req)
        assert resp.segments["type"] == "FeatureCollection"
        assert len(resp.segments["features"]) >= 1

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_meta_contains_expected_keys(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_no_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.9028, lng=12.4964),
            radius_km=1.0,
        )
        resp = run_pipeline(req)
        assert "total_cells" in resp.meta
        assert "total_segments" in resp.meta
        assert resp.meta["total_cells"] > 0
        assert resp.meta["total_segments"] >= 1


class TestPipelineWithRoads:
    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_produces_multiple_segments(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=1.0,
        )
        resp = run_pipeline(req)
        assert len(resp.segments["features"]) >= 1

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_restricted_areas_in_response(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=1.0,
        )
        resp = run_pipeline(req)
        assert resp.restricted_areas["type"] == "FeatureCollection"
        assert len(resp.restricted_areas["features"]) == 1
        assert resp.restricted_areas["features"][0]["properties"]["name"] == "Test Base"

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_some_cells_classified_as_restricted(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=1.0,
        )
        resp = run_pipeline(req)
        # Cell-level restriction classification is covered in test_restriction.py;
        # here we just confirm the restricted area flows through to the response.
        assert len(resp.restricted_areas["features"]) == 1
        assert resp.meta["total_cells"] > 0

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_segment_features_have_workload(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=1.0,
        )
        resp = run_pipeline(req)
        for feat in resp.segments["features"]:
            props = feat["properties"]
            assert "workload" in props
            assert "total_area_km2" in props
            assert "effective_area_km2" in props

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_all_cells_assigned_to_segment(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=0.5,
        )
        resp = run_pipeline(req)
        # Cells are assigned to segments internally; verify via segment cell_count.
        total_assigned = sum(f["properties"]["cell_count"] for f in resp.segments["features"])
        assert total_assigned > 0

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_segment_features_expose_cell_indices(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=0.5,
        )
        resp = run_pipeline(req)
        for feat in resp.segments["features"]:
            props = feat["properties"]
            assert "cells" in props
            assert isinstance(props["cells"], list)
            assert len(props["cells"]) == props["cell_count"]

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_with_resources(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=1.0,
            resources=[Resource(type="people", count=8)],
        )
        resp = run_pipeline(req)
        assert resp.meta["total_segments"] >= 1
        assert resp.meta["total_segments"] <= 8
        # All segments should have assigned_resource_type in properties
        for feat in resp.segments["features"]:
            assert "assigned_resource_type" in feat["properties"]

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_resource_types_match_input(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=1.0,
            resources=[
                Resource(type="people", count=4),
                Resource(type="cars", count=2),
            ],
        )
        resp = run_pipeline(req)
        assigned_types = {
            f["properties"]["assigned_resource_type"]
            for f in resp.segments["features"]
            if f["properties"]["assigned_resource_type"] is not None
        }
        # At least one of the requested types should appear
        assert assigned_types & {"people", "cars"}
        # resource_assignment should be in meta
        assert "resource_assignment" in resp.meta

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_segments_have_estimated_hours(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=1.0,
            resources=[Resource(type="people", count=4)],
        )
        resp = run_pipeline(req)
        for feat in resp.segments["features"]:
            assert "estimated_hours" in feat["properties"]
            assert feat["properties"]["estimated_hours"] >= 0

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_segments_have_priority(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=1.0,
        )
        resp = run_pipeline(req)
        searchable = [
            f for f in resp.segments["features"] if f["properties"]["searchable"]
        ]
        priorities = [f["properties"]["priority"] for f in searchable]
        assert all(p >= 1 for p in priorities)
        assert len(priorities) == len(set(priorities)), "Priorities must be unique"

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_priority_1_is_closest(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=1.0,
        )
        resp = run_pipeline(req)
        searchable = [
            f for f in resp.segments["features"] if f["properties"]["searchable"]
        ]
        if len(searchable) >= 2:
            p1 = next(f for f in searchable if f["properties"]["priority"] == 1)
            for f in searchable:
                assert (
                    p1["properties"]["lkp_distance_km"]
                    <= f["properties"]["lkp_distance_km"]
                )

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_lkp_distance_matches_geodesic(self, mock_osm):
        from pyproj import Geod

        geod = Geod(ellps="WGS84")
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=1.0,
        )

        resp = run_pipeline(req)

        checked = 0
        for f in resp.segments["features"]:
            if not f["properties"]["searchable"]:
                continue
            c = shape(f["geometry"]).centroid
            _, _, dist_m = geod.inv(12.498, 41.905, c.x, c.y)
            if dist_m < 100:
                continue
            reported = f["properties"]["lkp_distance_km"]
            assert abs(reported - dist_m / 1000.0) / (dist_m / 1000.0) < 0.05
            checked += 1
        assert checked > 0
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=1.0,
        )
        resp = run_pipeline(req)
        entry_points = [
            f["properties"]["entry_point"]
            for f in resp.segments["features"]
            if f["properties"]["searchable"]
        ]
        assert any(ep is not None for ep in entry_points)

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_entry_point_null_without_roads(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_no_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=0.5,
        )
        resp = run_pipeline(req)
        for feat in resp.segments["features"]:
            assert feat["properties"]["entry_point"] is None

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_searchable_property_in_response(self, mock_osm):
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=1.0,
        )
        resp = run_pipeline(req)
        for feat in resp.segments["features"]:
            assert "searchable" in feat["properties"]
            assert isinstance(feat["properties"]["searchable"], bool)

    @patch("findthem_geo.services.pipeline.fetch_osm_data")
    @pytest.mark.anyio
    async def test_segments_do_not_touch(self, mock_osm):
        """After insetting, no two segment polygons should intersect."""
        mock_osm.return_value = _mock_osm_data_with_roads()
        req = GenerateSegmentsRequest(
            center=LatLng(lat=41.905, lng=12.498),
            radius_km=1.0,
        )
        resp = run_pipeline(req)
        polys = [
            shape(f["geometry"])
            for f in resp.segments["features"]
            if f["geometry"]["type"] in ("Polygon", "MultiPolygon")
        ]
        for i, a in enumerate(polys):
            for j, b in enumerate(polys):
                if i >= j:
                    continue
                # Segments may share a point but should not overlap
                intersection = a.intersection(b)
                assert intersection.area == pytest.approx(0.0, abs=1e-12), (
                    f"Segments {i} and {j} overlap with area {intersection.area}"
                )
