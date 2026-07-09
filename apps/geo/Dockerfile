FROM python:3.12-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

FROM base AS deps

COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev --no-install-project

FROM deps AS runtime

COPY src/ src/
COPY pyproject.toml README.md ./
RUN uv sync --frozen --no-dev

ENV GEO_HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000

# --no-dev: don't re-sync dev deps (mypy/ruff) at container start.
# Honor $PORT so the same image works locally (8000) and on Cloud Run (injects 8080).
CMD ["sh", "-c", "uv run --no-dev uvicorn findthem_geo.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
