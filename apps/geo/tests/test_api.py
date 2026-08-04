from unittest.mock import patch

import pytest

from findthem_geo.config import settings
from findthem_geo.services.osm_fetcher import OSMData


def _mock_osm_no_roads(*args, **kwargs):
    return OSMData(road_graph=None, restricted_areas=[])


@pytest.fixture(autouse=True)
def mock_osm():
    """Mock OSM fetcher so API tests don't hit real network."""
    with patch(
        "findthem_geo.services.pipeline.fetch_osm_data",
        side_effect=_mock_osm_no_roads,
    ):
        yield


class TestHealthEndpoint:
    @pytest.mark.anyio
    async def test_health_returns_ok(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestGenerateSegmentsEndpoint:
    @pytest.mark.anyio
    async def test_returns_200_with_valid_request(self, client):
        resp = await client.post(
            "/api/v1/segments/generate",
            json={
                "center": {"lat": 41.9028, "lng": 12.4964},
                "radius_km": 1.0,
            },
        )
        assert resp.status_code == 200

    @pytest.mark.anyio
    async def test_response_has_geojson_structure(self, client):
        resp = await client.post(
            "/api/v1/segments/generate",
            json={
                "center": {"lat": 41.9028, "lng": 12.4964},
                "radius_km": 1.0,
            },
        )
        data = resp.json()
        assert "segments" in data
        assert "restricted_areas" in data
        assert data["segments"]["type"] == "FeatureCollection"
        assert data["restricted_areas"]["type"] == "FeatureCollection"

    @pytest.mark.anyio
    async def test_segment_features_have_cell_metadata(self, client):
        resp = await client.post(
            "/api/v1/segments/generate",
            json={
                "center": {"lat": 41.9028, "lng": 12.4964},
                "radius_km": 0.5,
            },
        )
        features = resp.json()["segments"]["features"]
        assert len(features) >= 1
        for feat in features:
            props = feat["properties"]
            assert "segment_id" in props
            assert "cell_count" in props

    @pytest.mark.anyio
    async def test_meta_contains_input_params(self, client):
        resp = await client.post(
            "/api/v1/segments/generate",
            json={
                "center": {"lat": 41.9028, "lng": 12.4964},
                "radius_km": 1.5,
                "h3_resolution": 8,
            },
        )
        meta = resp.json()["meta"]
        assert meta["radius_km"] == 1.5
        assert meta["h3_resolution"] == 8
        assert meta["total_cells"] > 0

    @pytest.mark.anyio
    async def test_segments_have_workload_properties(self, client):
        resp = await client.post(
            "/api/v1/segments/generate",
            json={
                "center": {"lat": 41.9028, "lng": 12.4964},
                "radius_km": 1.0,
            },
        )
        segments = resp.json()["segments"]["features"]
        assert len(segments) >= 1
        for feat in segments:
            props = feat["properties"]
            assert "segment_id" in props
            assert "workload" in props
            assert "total_area_km2" in props

    @pytest.mark.anyio
    async def test_rejects_invalid_radius(self, client):
        resp = await client.post(
            "/api/v1/segments/generate",
            json={
                "center": {"lat": 41.9028, "lng": 12.4964},
                "radius_km": -1,
            },
        )
        assert resp.status_code == 422

    @pytest.mark.anyio
    async def test_rejects_invalid_lat(self, client):
        resp = await client.post(
            "/api/v1/segments/generate",
            json={
                "center": {"lat": 100, "lng": 12.4964},
                "radius_km": 1.0,
            },
        )
        assert resp.status_code == 422

    @pytest.mark.anyio
    async def test_rejects_radius_too_large(self, client):
        resp = await client.post(
            "/api/v1/segments/generate",
            json={
                "center": {"lat": 41.9028, "lng": 12.4964},
                "radius_km": 100,
            },
        )
        assert resp.status_code == 422

    @pytest.mark.anyio
    async def test_rejects_oversized_grid(self, client):
        # Large radius at high resolution would generate millions of cells.
        resp = await client.post(
            "/api/v1/segments/generate",
            json={
                "center": {"lat": 41.9028, "lng": 12.4964},
                "radius_km": 50,
                "h3_resolution": 12,
            },
        )
        assert resp.status_code == 422


class TestInternalTokenGate:
    @pytest.mark.anyio
    async def test_no_token_configured_is_a_noop(self, client, monkeypatch):
        monkeypatch.setattr(settings, "internal_token", None)

        resp = await client.post(
            "/api/v1/segments/generate",
            json={"center": {"lat": 41.9028, "lng": 12.4964}, "radius_km": 1.0},
        )

        assert resp.status_code == 200

    @pytest.mark.anyio
    async def test_missing_header_rejected_when_token_configured(self, client, monkeypatch):
        monkeypatch.setattr(settings, "internal_token", "s3cret")

        resp = await client.post(
            "/api/v1/segments/generate",
            json={"center": {"lat": 41.9028, "lng": 12.4964}, "radius_km": 1.0},
        )

        assert resp.status_code == 403

    @pytest.mark.anyio
    async def test_wrong_header_rejected(self, client, monkeypatch):
        monkeypatch.setattr(settings, "internal_token", "s3cret")

        resp = await client.post(
            "/api/v1/segments/generate",
            json={"center": {"lat": 41.9028, "lng": 12.4964}, "radius_km": 1.0},
            headers={"x-internal-token": "wrong"},
        )

        assert resp.status_code == 403

    @pytest.mark.anyio
    async def test_correct_header_accepted(self, client, monkeypatch):
        monkeypatch.setattr(settings, "internal_token", "s3cret")

        resp = await client.post(
            "/api/v1/segments/generate",
            json={"center": {"lat": 41.9028, "lng": 12.4964}, "radius_km": 1.0},
            headers={"x-internal-token": "s3cret"},
        )

        assert resp.status_code == 200

    @pytest.mark.anyio
    async def test_gate_does_not_apply_to_health(self, client, monkeypatch):
        monkeypatch.setattr(settings, "internal_token", "s3cret")

        resp = await client.get("/health")

        assert resp.status_code == 200
