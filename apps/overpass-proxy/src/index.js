// Cloudflare Worker: thin reverse proxy to overpass-api.de.
//
// The findthem-geo service runs on Cloud Run, whose datacenter IPs are blocked by
// overpass-api.de. Cloudflare's egress is not, so geo points its Overpass base URL at
// this Worker and we forward verbatim. Only /api/* is proxied (not an open relay).

const UPSTREAM = 'https://overpass-api.de'

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === '/' ) {
      return new Response('overpass-proxy: ok', { status: 200 })
    }
    if (!url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 })
    }

    const target = UPSTREAM + url.pathname + url.search

    const headers = new Headers()
    const ct = request.headers.get('content-type')
    if (ct) headers.set('content-type', ct)
    headers.set('user-agent', 'findthem-geo/0.1 (search-and-rescue coordination)')
    headers.set('accept', 'application/json')

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
    const body = hasBody ? await request.arrayBuffer() : undefined

    let upstreamResp
    try {
      upstreamResp = await fetch(target, { method: request.method, headers, body })
    } catch (e) {
      return new Response(`upstream fetch failed: ${e}`, { status: 502 })
    }

    const respHeaders = new Headers()
    const rct = upstreamResp.headers.get('content-type')
    if (rct) respHeaders.set('content-type', rct)
    return new Response(upstreamResp.body, { status: upstreamResp.status, headers: respHeaders })
  },
}
