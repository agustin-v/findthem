# FindThem — Search & Rescue Coordination Platform

A platform for coordinating search-and-rescue operations. A coordinator creates a search
from a last-known-position (LKP) and radius; volunteers receive balanced, road-bounded
search segments to sweep, mark searched, and report back on — from the field, often with
poor or no connectivity.

## Monorepo layout

```
apps/
├── ui/             — React/TypeScript coordinator frontend (Vite, TailwindCSS, shadcn/ui)
├── mobile/         — Expo/React Native volunteer app (join flow, offline-capable map view)
├── api/            — Elixir/Phoenix backend (Postgres, REST + realtime, proxies geo)
├── geo/            — Python/FastAPI geo segmentation microservice (stateless)
└── overpass-proxy/ — Cloudflare Worker relaying apps/geo's Overpass API calls (see its own README)
docs/               — design notes
Makefile            — dev/install/test shortcuts
```

Coordinators work from `apps/ui` (desktop/laptop browser); volunteers work from
`apps/mobile` (native iOS/Android — background location, offline storage, camera). Both
clients talk only to `apps/api`, which is the single stateful backend: it persists
everything to Postgres, proxies segment generation to the stateless `apps/geo` service
(server-to-server, gated by a shared secret — neither client ever reaches `apps/geo`
directly), and pushes realtime updates over Phoenix Channels with REST polling as a
fallback.

`apps/ui`, `apps/mobile`, and `apps/geo` each have their own `CLAUDE.md` — the
actively-maintained deep reference (architecture, key files, known gaps) for that app.
`apps/api`'s equivalent lives in the repo root `CLAUDE.md` instead (it has no local one).
This README is just the map and the quick start.

## Prerequisites

- **Node.js** 20+ and **pnpm** — for `apps/ui` and `apps/mobile`
- **Elixir 1.19 / Erlang·OTP 28** and **Docker** (for Postgres via `docker-compose`) — for `apps/api`
- **Python 3.12** and **uv** ([install](https://docs.astral.sh/uv/)) — for `apps/geo`
- A **TomTom Maps API key** — for both map clients ([get one free](https://developer.tomtom.com/))
- A **Clerk** account — for coordinator auth on `apps/ui` (`apps/api` needs no Clerk secret,
  only the public issuer/JWKS URL)
- For running `apps/geo` locally, `uv sync` pulls binary wheels for the geospatial stack
  (Shapely, pyproj, GeoPandas). If your platform needs system libraries, install
  **GDAL / GEOS / PROJ**, or use the provided Docker image instead (see below).
- Running `apps/mobile` on a simulator/device needs a native dev-client build (`expo
  run:ios`/`run:android`) — see `apps/mobile/CLAUDE.md`. `pnpm web` works for the
  join/pending flow only; the native map view has no web backing.

## Quick start

```sh
# 1. Configure environment (see "Environment" below)
cp apps/ui/.env.example     apps/ui/.env
cp apps/mobile/.env.example apps/mobile/.env
cp apps/api/.env.example    apps/api/.env      # optional — dev has working defaults
cp apps/geo/.env.example    apps/geo/.env      # optional — geo has working defaults

# 2. Start Postgres, then install dependencies for every app
make db
make install

# 3. Migrate the database
cd apps/api && mix ecto.create && mix ecto.migrate && cd ../..

# 4. Run geo (:8000), api (:4000), and the coordinator UI (:5173)
make dev
```

Then open http://localhost:5173. `apps/mobile` isn't part of the `dev` fan-out (it's an
interactive Expo dev-client/simulator target, not a plain background server) — run it
separately with `make dev-mobile`.

## Environment

**`apps/ui/.env`**

| Variable | Purpose |
|----------|---------|
| `VITE_TOMTOM_API_KEY` | TomTom Maps API key (required for the map) |
| `VITE_API_URL` | Base URL of `apps/api` (default `http://localhost:4000`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (coordinator auth) |

**`apps/mobile/.env`**

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | Base URL of `apps/api` (default `http://localhost:4000`) |
| `EXPO_PUBLIC_TOMTOM_API_KEY` | TomTom Maps API key (required for the map) |

**`apps/api/.env`** — all optional in dev (sensible defaults in `config/runtime.exs`);
see the file for the full, commented list. The two required in prod:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string (prod only; dev uses `config/dev.exs`) |
| `SECRET_KEY_BASE` | Cookie/session signing key (prod only; generate with `mix phx.gen.secret`) |
| `CORS_ORIGINS` | Comma-separated allowed browser origins (prod only; dev auto-allows any localhost port) |
| `GEO_URL` / `GEO_INTERNAL_TOKEN` | `apps/geo` base URL + shared secret for the internal proxy |
| `CLERK_ISSUER` / `CLERK_AUTHORIZED_PARTIES` | Clerk JWT verification (defaults point at the dev Clerk instance) |

**`apps/geo/.env`** — all optional (sensible defaults in `config.py`), `GEO_` prefixed:

| Variable | Default | Purpose |
|----------|---------|---------|
| `GEO_HOST` / `GEO_PORT` | `0.0.0.0` / `8000` | Bind address / port |
| `GEO_CORS_ORIGINS` | `["http://localhost:5173"]` | Allowed CORS origins |
| `GEO_OSM_CACHE_DIR` | `.cache/osm` | Disk cache for OSM data |
| `GEO_OSM_CACHE_TTL_HOURS` | `24` | Cache time-to-live |
| `GEO_DEFAULT_H3_RESOLUTION` | `9` | Default H3 grid resolution |
| `GEO_MIN_SEGMENT_AREA_M2` | `500.0` | Minimum segment area (smaller = slivers) |
| `GEO_INTERNAL_TOKEN` | unset | Shared secret required on `X-Internal-Token`; no-op if unset |

## Running each app manually

**Coordinator frontend** (`apps/ui`)

```sh
cd apps/ui
pnpm install
pnpm dev          # dev server on http://localhost:5173
```

**Volunteer app** (`apps/mobile`)

```sh
cd apps/mobile
pnpm install
pnpm start        # Expo dev server — press i/a for a simulator, or `pnpm web`
```

**Backend** (`apps/api`)

```sh
make db                                 # from repo root — starts Postgres (postgis/postgis:16-3.4)
cd apps/api && mix deps.get && mix ecto.create && mix ecto.migrate
cd apps/api && mix phx.server           # http://localhost:4000
```

Health check: `GET http://localhost:4000/health` → `{"status": "ok"}`

**Geo service** (`apps/geo`)

```sh
cd apps/geo
uv sync
uv run uvicorn findthem_geo.main:app --reload   # http://localhost:8000
```

Health check: `GET http://localhost:8000/health` → `{"status": "ok"}`
Main endpoint: `POST /api/v1/segments/generate` — never called by a browser or the
mobile app directly; `apps/api` is the only caller. See `apps/geo/CLAUDE.md` for the
request/response shape.

## Testing & linting

```sh
make test           # runs all four suites
make test-ui        # cd apps/ui     && pnpm test
make test-mobile    # cd apps/mobile && pnpm test   (pure-logic only, see apps/mobile/CLAUDE.md)
make test-api       # cd apps/api    && mix test
make test-geo       # cd apps/geo    && uv run pytest   (all mocked, no network)
make lint-mobile    # cd apps/mobile && pnpm lint
make lint-geo       # cd apps/geo    && uv run ruff check
```

## Docker (geo service)

```sh
cd apps/geo
docker build -t findthem-geo .
docker run -p 8000:8000 findthem-geo
```

The image bundles the GDAL/GEOS/PROJ system libraries and uses `uv` for dependencies.
