.PHONY: dev dev-ui dev-geo install install-ui install-geo test test-ui test-geo lint-geo

# Run both frontend and backend in dev mode
dev:
	@echo "Starting geo backend (port 8000) and UI (port 5173)..."
	$(MAKE) dev-geo & $(MAKE) dev-ui & wait

dev-ui:
	cd apps/ui && pnpm dev

dev-geo:
	cd apps/geo && uv run uvicorn findthem_geo.main:app --reload

# Install dependencies
install: install-ui install-geo

install-ui:
	cd apps/ui && pnpm install

install-geo:
	cd apps/geo && uv sync

# Tests
test: test-geo test-ui

test-ui:
	cd apps/ui && pnpm test

test-geo:
	cd apps/geo && uv run pytest

# Lint
lint-geo:
	cd apps/geo && uv run ruff check
