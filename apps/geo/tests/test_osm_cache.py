import json
import time

import pytest

from findthem_geo.cache.osm_cache import cache_key, get_cached, set_cached


@pytest.fixture(autouse=True)
def tmp_cache_dir(tmp_path, monkeypatch):
    """Point cache to a temp directory for each test."""
    monkeypatch.setattr("findthem_geo.cache.osm_cache.settings.osm_cache_dir", str(tmp_path))
    return tmp_path


class TestCacheKey:
    def test_deterministic(self):
        k1 = cache_key(41.9028, 12.4964, 1000.0, "roads")
        k2 = cache_key(41.9028, 12.4964, 1000.0, "roads")
        assert k1 == k2

    def test_different_tags_produce_different_keys(self):
        k1 = cache_key(41.9028, 12.4964, 1000.0, "roads")
        k2 = cache_key(41.9028, 12.4964, 1000.0, "restricted")
        assert k1 != k2

    def test_quantizes_coordinates(self):
        k1 = cache_key(41.90281, 12.49641, 1000.0, "roads")
        k2 = cache_key(41.90289, 12.49649, 1000.0, "roads")
        assert k1 == k2, "Small coord differences should produce same key"

    def test_different_locations_produce_different_keys(self):
        k1 = cache_key(41.9028, 12.4964, 1000.0, "roads")
        k2 = cache_key(48.8566, 2.3522, 1000.0, "roads")
        assert k1 != k2


class TestSetAndGetCached:
    def test_roundtrip(self):
        set_cached("test_key", {"data": [1, 2, 3]})
        result = get_cached("test_key")
        assert result == {"data": [1, 2, 3]}

    def test_missing_key_returns_none(self):
        assert get_cached("nonexistent") is None

    def test_expired_entry_returns_none(self, tmp_cache_dir, monkeypatch):
        monkeypatch.setattr("findthem_geo.cache.osm_cache.settings.osm_cache_ttl_hours", 24)
        set_cached("old_key", {"old": True})
        # Manually backdate the timestamp
        path = tmp_cache_dir / "old_key.json"
        data = json.loads(path.read_text())
        data["ts"] = time.time() - 25 * 3600  # 25 hours ago
        path.write_text(json.dumps(data))
        assert get_cached("old_key") is None

    def test_non_expired_entry_returns_data(self, tmp_cache_dir, monkeypatch):
        monkeypatch.setattr("findthem_geo.cache.osm_cache.settings.osm_cache_ttl_hours", 24)
        set_cached("fresh_key", {"fresh": True})
        assert get_cached("fresh_key") == {"fresh": True}

    def test_corrupt_json_returns_none_and_removes_file(self, tmp_cache_dir):
        path = tmp_cache_dir / "bad_key.json"
        path.write_text("{not valid json")

        result = get_cached("bad_key")

        assert result is None
        assert not path.exists()

    def test_missing_ts_field_returns_none(self, tmp_cache_dir):
        path = tmp_cache_dir / "no_ts.json"
        path.write_text(json.dumps({"payload": {"x": 1}}))

        result = get_cached("no_ts")

        assert result is None
