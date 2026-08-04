---
title: FindThem Geo
emoji: 🧭
colorFrom: blue
colorTo: green
sdk: docker
app_port: 8000
pinned: false
---

# FindThem Geo

Stateless geo-segmentation microservice for the FindThem search-and-rescue platform.
Generates road-bounded, restriction-aware search segments from a last-known-position
and radius. See `CLAUDE.md` for full architecture and API details.

Deployed here as a Hugging Face Space (Docker SDK, listens on port 8000).

Set `GEO_INTERNAL_TOKEN` to require a matching `X-Internal-Token` header on `POST /api/v1/segments/generate` (apps/api sends it). The Space's URL is otherwise public, so this header is the actual access gate — set it, and lock `GEO_CORS_ORIGINS` down, once the browser no longer calls this service directly.
