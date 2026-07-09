# FindThem — Search & Rescue Coordination Platform

A platform for coordinating search-and-rescue operations. Volunteers receive balanced,
road-bounded search segments generated from a last-known-position (LKP) and radius.

## Monorepo layout

```
apps/
├── ui/    — React/TypeScript frontend (Vite, TailwindCSS, shadcn/ui, TomTom Maps)
└── geo/   — Python/FastAPI geo segmentation microservice
docs/      — design notes
Makefile   — dev/install/test shortcuts
```

The two apps run independently: the UI (port **5173**) calls the geo service (port **8000**).

## Prerequisites

- **Node.js** 20+ and **pnpm** — for `apps/ui`
- **Python 3.12** and **uv** ([install](https://docs.astral.sh/uv/)) — for `apps/geo`
- A **TomTom Maps API key** — for the UI map ([get one free](https://developer.tomtom.com/))
- For running `apps/geo` locally, `uv sync` pulls binary wheels for the geospatial stack
  (Shapely, pyproj, GeoPandas). If your platform needs system libraries, install
  **GDAL / GEOS / PROJ**, or use the provided Docker image instead (see below).

## Quick start

```sh
# 1. Configure environment (see "Environment" below)
cp apps/ui/.env.example  apps/ui/.env
cp apps/geo/.env.example apps/geo/.env   # optional — geo has working defaults

# 2. Install dependencies for both apps
make install

# 3. Run both (geo on :8000, UI on :5173)
make dev
```

Then open http://localhost:5173.

## Environment

**`apps/ui/.env`**

| Variable | Purpose |
|----------|---------|
| `VITE_TOMTOM_API_KEY` | TomTom Maps API key (required for the map) |
| `VITE_GEO_API_URL` | Base URL of the geo service (default `http://localhost:8000`) |

**`apps/geo/.env`** — all optional (sensible defaults in `config.py`), `GEO_` prefixed:

| Variable | Default | Purpose |
|----------|---------|---------|
| `GEO_HOST` / `GEO_PORT` | `0.0.0.0` / `8000` | Bind address / port |
| `GEO_CORS_ORIGINS` | `["http://localhost:5173"]` | Allowed CORS origins |
| `GEO_OSM_CACHE_DIR` | `.cache/osm` | Disk cache for OSM data |
| `GEO_OSM_CACHE_TTL_HOURS` | `24` | Cache time-to-live |
| `GEO_DEFAULT_H3_RESOLUTION` | `9` | Default H3 grid resolution |
| `GEO_MIN_SEGMENT_AREA_M2` | `500.0` | Minimum segment area (smaller = slivers) |

## Running each app manually

**Frontend** (`apps/ui`)

```sh
cd apps/ui
pnpm install
pnpm dev          # dev server on http://localhost:5173
```

**Geo service** (`apps/geo`)

```sh
cd apps/geo
uv sync
uv run uvicorn findthem_geo.main:app --reload   # http://localhost:8000
```

Health check: `GET http://localhost:8000/health` → `{"status": "ok"}`
Main endpoint: `POST http://localhost:8000/api/v1/segments/generate`

```jsonc
// request body
{
  "center": { "lat": 41.9028, "lng": 12.4964 },
  "radius_km": 1.5,
  "h3_resolution": 9,
  "resources": [{ "type": "people", "count": 8 }]
}
```

## Testing & linting

```sh
make test          # runs both suites
make test-geo      # cd apps/geo && uv run pytest   (all mocked, no network)
make test-ui       # cd apps/ui  && pnpm test
make lint-geo      # cd apps/geo && uv run ruff check
```

## Docker (geo service)

```sh
cd apps/geo
docker build -t findthem-geo .
docker run -p 8000:8000 findthem-geo
```

The image bundles the GDAL/GEOS/PROJ system libraries and uses `uv` for dependencies.
