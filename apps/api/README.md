# FindThem API

Elixir/Phoenix backend: Postgres-backed CRUD for searches/segments/volunteers/remarks/
messages, realtime updates over Phoenix Channels (REST polling as fallback), and a
synchronous proxy in front of `apps/geo` for segment generation. API-only (no
HTML/assets/mailer). See the repo root `CLAUDE.md` (apps/api has no local one) for full
architecture.

## Run

```sh
make db                          # from repo root — starts Postgres (postgis/postgis:16-3.4)
cd apps/api && mix deps.get && mix ecto.create
cd apps/api && mix phx.server    # http://localhost:4000
```

Or from the repo root: `make install-api` then `make dev-api`.

## Test

```sh
mix test
```

## Health check

```sh
curl http://localhost:4000/health   # {"status": "ok"}
```

## Environment

See `.env.example`. All variables have dev-friendly defaults in `config/runtime.exs` except
`DATABASE_URL` and `SECRET_KEY_BASE`, which are required in prod.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string (prod only; dev uses `config/dev.exs`) |
| `PORT` | HTTP port (default `4000`) |
| `CORS_ORIGINS` | Comma-separated list of allowed browser origins |
| `SECRET_KEY_BASE` | Cookie/session signing key (prod only; generate with `mix phx.gen.secret`) |
| `CLERK_ISSUER` / `CLERK_AUTHORIZED_PARTIES` | Clerk JWT verification (Epic #2) |
| `GEO_URL` / `GEO_INTERNAL_TOKEN` | `apps/geo` base URL + shared secret for the internal proxy |

Dev Postgres connection (`config/dev.exs`): `postgres` / `postgres` @ `localhost:5432`,
database `findthem_api_dev` — matches the `db` service in the root `docker-compose.yml`.

## LiveDashboard

Available at `http://localhost:4000/dev/dashboard` in dev only.
