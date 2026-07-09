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
