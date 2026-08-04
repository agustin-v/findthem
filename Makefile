.PHONY: dev dev-ui dev-geo dev-api install install-ui install-geo install-api test test-ui test-geo test-api lint-geo db

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

# Postgres (via docker-compose)
db:
	docker compose up -d db

# Install dependencies
install: install-ui install-geo install-api

install-ui:
	cd apps/ui && pnpm install

install-geo:
	cd apps/geo && uv sync

install-api:
	cd apps/api && mix deps.get

# Tests
test: test-geo test-ui test-api

test-ui:
	cd apps/ui && pnpm test

test-geo:
	cd apps/geo && uv run pytest

test-api:
	cd apps/api && mix test

# Lint
lint-geo:
	cd apps/geo && uv run ruff check
