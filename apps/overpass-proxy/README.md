# overpass-proxy

A Cloudflare Worker that reverse-proxies Overpass API requests to `overpass-api.de`.

## Why

`overpass-api.de` firewall-blocks Google Cloud IP ranges, so the `findthem-geo`
service on Cloud Run cannot reach it directly (IPv4 connect timeouts; IPv6 is
inconsistent on Cloud Run). Cloudflare's egress is not blocked, so geo points its
Overpass base URL at this Worker and the Worker forwards the request.

Only `/api/*` paths are proxied — it is not an open relay.

## Deploy

```sh
cd apps/overpass-proxy
wrangler deploy
```

This prints a URL like `https://overpass-proxy.<account>.workers.dev`.

## Wire up the geo service

Point geo at the Worker (osmnx appends `/interpreter` to this base):

```sh
gcloud run services update findthem-geo --region us-central1 \
  --set-env-vars GEO_OVERPASS_URL=https://overpass-proxy.<account>.workers.dev/api
```

No geo rebuild needed — `GEO_OVERPASS_URL` is read at startup.
