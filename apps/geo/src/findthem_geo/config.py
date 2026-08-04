from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_prefix": "GEO_"}

    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = ["*"]
    # When set, /api/v1/segments/generate requires a matching X-Internal-Token
    # header (apps/api's Story 5 client sends it). None = no-op, for local dev
    # and any deploy that hasn't set the shared secret yet.
    internal_token: str | None = None
    osm_cache_dir: str = ".cache/osm"
    osm_cache_ttl_hours: int = 24
    osm_request_timeout_s: int = 60  # per-request timeout for osmnx + Overpass calls
    osm_retries: int = 3  # attempts for transient OSM/Overpass failures (SSL, connection)
    overpass_rate_limit: bool = True  # osmnx waits for a free Overpass slot (avoids 429s)
    overpass_url: str = "https://overpass-api.de/api"  # base URL; osmnx appends /interpreter
    # overpass-api.de blocks IPv4 from Google Cloud ranges; its IPv6 is unreliable on
    # Cloud Run (inconsistent egress). Leave off and prefer a v4-reachable mirror.
    overpass_force_ipv6: bool = False
    default_h3_resolution: int = 9
    max_h3_cells: int = 50000  # reject requests whose grid would exceed this (OOM guard)
    min_segment_area_m2: float = 500.0
    # A road-bounded block is kept whole when at least this fraction of its area is
    # inside the search radius; blocks mostly outside are dropped (keeps the search
    # area near the requested size instead of sprawling to the fetched-data extent).
    block_keep_fraction: float = 0.5
    segment_inset_m: float = 5.0  # gap width (m) between a segment and roads/borders it does NOT own
    road_half_width_m: float = 4.0  # half-width (m) of the road corridor owned by a single segment
    road_owner_offset_m: float = 1.5  # extra overshoot (m) so the owner clearly encloses the road
    resource_speed_kmh: dict[str, float] = {
        "people": 5.0,
        "motorbikes": 25.0,
        "cars": 30.0,
        "drones": 40.0,
    }
    vehicle_types: list[str] = ["cars", "motorbikes"]
    road_density_threshold: float = 5.0  # km of road per km²; below = foot/drone only
    # A segment whose area overlaps no-car land use (park/pedestrian/water/farmland) by at
    # least this fraction is forced foot/drone-only regardless of road density.
    vehicle_exclusion_min_fraction: float = 0.5


settings = Settings()
