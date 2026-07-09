# FindThem — Backend Review & Persistence Plan

_Reviewed 2026-06-10. Covers `apps/geo` (FastAPI segmentation service), `apps/ui` (React), and the gap between the current code and the SAR Platform v3 user journey (`~/projects/sar/index.html`)._

---

## 1. Backend review — `apps/geo`

### Correctness issues (fix first)

1. **Blocking I/O inside an async endpoint.** `run_pipeline` is `async def` but every step is synchronous — `osmnx.graph_from_point`, `requests.post` to Overpass, and seconds of Shapely work. One in-flight request freezes the whole event loop: `/health` and every other request stall until the pipeline finishes.
   _Fix:_ declare the route `def generate_segments(...)` (FastAPI runs sync routes in a threadpool) or wrap the pipeline in `anyio.to_thread.run_sync`. Add a semaphore to cap concurrent pipelines (osmnx is memory-hungry).

2. **Overpass relations are silently dropped.** `_RESTRICTED_QUERY_TEMPLATE` requests `relation["landuse"="military"]` etc., but `_parse_overpass_to_polygons` only handles `way` elements. Large military zones, airports, and prisons mapped as multipolygon *relations* vanish — a safety-relevant bug for a SAR tool (volunteers could be routed into a restricted area).
   _Fix:_ assemble relation members into polygons (or use `osmnx.features_from_point` with the same tags, which handles this).

3. **Linear ways are force-closed into bogus polygons.** The query fetches `way["access"="private"]` / `"no"` — most of those are private *roads/paths*, not areas. The parser closes any ≥4-node way into a ring, fabricating restricted polygons that don't exist.
   _Fix:_ only polygonize ways that are already closed (`nodes[0] == nodes[-1]`) or carry an area tag (`area=yes`, `landuse`, `building`, …).

4. **Unbounded compute per request.** Validation allows `radius_km=50` with `h3_resolution=12` → tens of millions of H3 cells → OOM/CPU blowup. One request can take the service down.
   _Fix:_ validate the *combination* — estimate cell count (`area / avg_hexagon_area(res)`) and reject above a configured cap (e.g. 50k cells) with a 422 explaining the limit.

5. **CORS misconfiguration.** `allow_origins=["*"]` together with `allow_credentials=True` is an invalid combo (browsers reject wildcard + credentials). Pin `GEO_CORS_ORIGINS` to the UI origin(s) per environment.

### Robustness / hygiene

6. **Cache is fragile.** `osm_cache.py` writes with `path.write_text(...)` (non-atomic — a crash mid-write leaves a corrupt file) and `get_cached` does `json.loads` with no error handling — a corrupt entry turns into a 500 on every request for that area until manually deleted. No size bound either.
   _Fix:_ write to a temp file + `os.replace`; wrap reads in `try/except` and treat corruption as a miss; add an LRU-style size cap or periodic sweep. (Note: there's a stray `apps/geo/cache/` directory with old entries — looks like the cache dir once pointed there; delete it.)

7. **`requests` is not a declared dependency.** It's imported in `api/segments.py` and `services/osm_fetcher.py` but only present transitively via osmnx. Add it to `pyproject.toml`.

8. **No retry/backoff or mirror for Overpass.** A single hardcoded endpoint with one attempt. Add 1–2 retries with backoff and a fallback mirror (`overpass.kumi.systems`), and identify the app via a `User-Agent` header (Overpass etiquette).

9. **`_inset_polygon` discards territory.** When the negative buffer yields a MultiPolygon it keeps only the largest piece, so the displayed segment can silently omit parts of the real search area. Return the full MultiPolygon instead.

10. **No observability.** Add per-step timings in the pipeline log (grid / fetch / polygonize / balance), a request ID middleware, and a `meta.timings_ms` block in the response — invaluable when a generation is slow in the field.

11. **Not a git repository.** The whole findthem monorepo has no `.git`. Before anything else: `git init`, commit, and push to a remote. Make sure `.env`, `.cache/`, `.venv/` are ignored.

The service's stateless design itself is good — keep geo as a pure compute engine. Persistence belongs in a new service (below), not bolted onto geo.

---

## 2. Plan — persisting searches

Today every domain object (auth, searches, volunteers, zones) is mocked in `apps/ui/src/lib/api.ts` with in-memory Maps; a page refresh loses everything, and segmentation results are recomputed and thrown away. The design doc already assumes "saved to PostGIS" — this plan gets there incrementally.

### Architecture decision

Add a new **`apps/api`** service (FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL/PostGIS) that owns all state and is the only thing the UI talks to. It calls `apps/geo` internally for segmentation. Rationale:

- geo stays stateless/cacheable/horizontally scalable, and its heavy geospatial deps stay out of the CRUD service;
- one backend owns auth + authorization, so the geo service never needs to be exposed publicly;
- same language/framework as geo — shared conventions, shared dev tooling (uv, ruff, mypy, pytest).

`docker-compose.yml` at the repo root: `postgis/postgis:16`, `api`, `geo`, plus the Vite dev server run natively.

### Phase 0 — Repo hygiene (½ day)
- `git init`, root `.gitignore`, initial commit, remote.
- Delete stray `apps/geo/cache/`; confirm `.env` files are ignored and `.env.example` files are complete.

### Phase 1 — Database + search CRUD (the core)

Schema (PostGIS enabled; geometries in 4326):

```
users          id pk · email unique · password_hash · name · created_at
searches       id pk · owner_id fk · subject_type (person|animal|object) · subject_name
               · subject_details jsonb · status (draft|active|suspended|resolved|closed)
               · lkp geography(Point) · lkp_at timestamptz · radius_km · h3_resolution
               · outcome text null · created_at · closed_at
generations    id pk · search_id fk · request_params jsonb · meta jsonb
               · response_geojson jsonb · created_at        -- one row per pipeline run
zones          search_id fk · h3_index text · status (not_assigned|assigned|in_progress|searched)
               · segment_id int · searched_at timestamptz · searched_by text
               · pk (search_id, h3_index)
volunteers     id pk · search_id fk · name · resource_type · phone text null
               · consent_name bool · consent_location bool · consent_phone bool
               · join_token text unique · joined_at · left_at
remarks        id pk · search_id fk · volunteer_id fk null · kind (sighting|obstacle|note)
               · text · location geography(Point) null · created_at
```

Pragmatic choice: store each segmentation result as **whole-response JSONB** in `generations` first (instant win — refresh-proof maps, replayable history, no recompute). Promote segments to typed PostGIS rows later only when you need spatial queries (e.g. "which segment contains this remark").

Endpoints (`/api/v1`):
- `POST /auth/signup`, `POST /auth/login` (JWT), `GET /me`
- `POST /searches`, `GET /searches`, `GET /searches/{id}`, `PATCH /searches/{id}` (status/outcome)
- `POST /searches/{id}/generate` → calls geo, persists a `generations` row, seeds `zones` from the returned H3 grid, returns the stored response
- `PATCH /searches/{id}/zones/{h3_index}` (status updates; sets `searched_at`)
- `POST /searches/{id}/volunteers` (join via link token, consent flags), `GET /searches/{id}/volunteers`
- `POST /searches/{id}/remarks`, `GET /searches/{id}/remarks`

Testing mirrors geo's conventions: pytest + httpx ASGI client, a disposable Postgres via `testcontainers` (or a compose-managed test DB).

### Phase 2 — Wire the UI
- Replace the mock `api.ts` with a real client hitting `apps/api` (keep the same function signatures so pages barely change; `VITE_API_URL` env var).
- Keep `geo-api.ts` only as a type source — segment generation now goes through `apps/api`.
- Store the JWT; add auth guard to dashboard routes; surface real loading/error states (the mock `delay()` calls disappear).

### Phase 3 — Live coordination
- WebSocket (or SSE) channel per search on `apps/api`: zone status changes, new remarks, volunteer presence.
- Volunteer live location: **in-memory only** (Redis pub/sub or process memory), never written to the DB — this matches the GDPR commitment in the design doc.
- Zone decay needs no job: store `searched_at` + decay window per subject type and compute freshness client-side / in queries (`now() - searched_at`).

### Phase 4 — GDPR lifecycle
- Scheduled job (e.g. APScheduler in `apps/api`): 30 days after `closed_at`, null out volunteer names/phones and remark authorship.
- `DELETE /searches/{id}` full-deletion endpoint for the creator.
- Consent withdrawal endpoint for volunteers (stops location channel immediately).

---

## 3. Whole-app improvements (beyond persistence)

| Area | Improvement |
|------|-------------|
| Geo service | Items 1–10 above; the blocking-event-loop and Overpass-relation bugs are the priority. |
| Security | Real password hashing (argon2/bcrypt), rate limiting on auth + generate endpoints, geo service not publicly exposed (only `apps/api` reaches it). |
| CI | GitHub Actions: ruff + mypy + pytest (geo, api), eslint + vitest + tsc (ui), Docker builds. Cheap to add once git exists. |
| Dev experience | Root `docker-compose.yml` (db + api + geo) and extend the `Makefile` (`make dev` brings everything up). |
| Frontend | Adopt TanStack Query for server state (cache, retries, optimistic zone updates) instead of hand-rolled fetching; error boundaries; offline tolerance for volunteers in the field (queue zone updates, replay on reconnect — searches happen where coverage is bad). |
| Mobile | The volunteer flow is phone-first; audit the map/zone UI at 380px and make zone marking work with GPS ("mark the cell I'm standing in"). |
| Observability | Structured logging (request IDs across api → geo), Sentry or similar on both services and the UI. |
| Design-doc gaps | Time-stepped areas (T+1h/3h/6h/12h isochrones), subject-type-specific models, and auto-assignment of next zone are in the v3 journey but not yet in code — the `generations` table is the natural place to store multiple time-step runs per search. |

### Suggested order

1. Phase 0 (git) — immediately.
2. Geo fixes 1–5 — small, high-impact, no architecture changes.
3. Phase 1 (api + Postgres + search persistence) — the heart of this plan.
4. Phase 2 (UI wiring) — makes persistence visible.
5. CI + compose alongside 3–4.
6. Phases 3–4 (realtime, GDPR) once real users join searches.
