import hashlib
import json
import time
from pathlib import Path
from typing import Any

from findthem_geo.config import settings


def _cache_dir() -> Path:
    p = Path(settings.osm_cache_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _quantize(val: float, precision: int = 3) -> float:
    """Quantize coordinate to reduce cache key variations."""
    return round(val, precision)


def cache_key(lat: float, lng: float, radius_m: float, tag: str) -> str:
    """Generate a deterministic cache key from quantized parameters."""
    qlat = _quantize(lat)
    qlng = _quantize(lng)
    qrad = _quantize(radius_m, 0)
    raw = f"{tag}:{qlat}:{qlng}:{qrad}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def get_cached(key: str) -> Any | None:
    """Return cached data if it exists and is within TTL, else None."""
    path = _cache_dir() / f"{key}.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    age_hours = (time.time() - data["ts"]) / 3600
    if age_hours > settings.osm_cache_ttl_hours:
        path.unlink(missing_ok=True)
        return None
    return data["payload"]


def set_cached(key: str, payload: Any) -> None:
    """Write data to disk cache with current timestamp."""
    path = _cache_dir() / f"{key}.json"
    data = {"ts": time.time(), "payload": payload}
    path.write_text(json.dumps(data))
