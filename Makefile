.PHONY: dev dev-ui dev-geo dev-api dev-mobile install install-ui install-geo install-api install-mobile test test-ui test-geo test-api test-mobile lint-geo lint-mobile db

# Run frontend, geo backend, and api backend in dev mode
dev: db
	@echo "Starting geo backend (port 8000), api backend (port 4000), and UI (port 5173)..."
	$(MAKE) dev-geo & $(MAKE) dev-api & $(MAKE) dev-ui & wait

dev-ui:
	cd apps/ui && pnpm dev

dev-geo:
	cd apps/geo && uv run uvicorn findthem_geo.main:app --reload

dev-api:
	cd apps/api && mix phx.server

# Volunteer app (Expo) — not part of the default `dev` fan-out since it's an
# interactive dev-client/simulator target, not a plain background server.
# Run `make dev-mobile` separately; `pnpm web` for a browser-testable target.
dev-mobile:
	cd apps/mobile && pnpm start

# Postgres (via docker-compose)
db:
	docker compose up -d db

# Install dependencies
install: install-ui install-geo install-api install-mobile

install-ui:
	cd apps/ui && pnpm install

install-geo:
	cd apps/geo && uv sync

install-api:
	cd apps/api && mix deps.get

install-mobile:
	cd apps/mobile && pnpm install

# Tests
test: test-geo test-ui test-api test-mobile

test-ui:
	cd apps/ui && pnpm test

test-geo:
	cd apps/geo && uv run pytest

test-api:
	cd apps/api && mix test

test-mobile:
	cd apps/mobile && pnpm test

# Lint
lint-geo:
	cd apps/geo && uv run ruff check

lint-mobile:
	cd apps/mobile && pnpm lint
