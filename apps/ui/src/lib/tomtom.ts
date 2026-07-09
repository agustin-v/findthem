const API_KEY = import.meta.env.VITE_TOMTOM_API_KEY as string | undefined

export function hasApiKey(): boolean {
  return !!API_KEY
}

export function getMapStyleUrl(): string {
  return `https://api.tomtom.com/map/1/style/25.2.3-0/2/basic_street-light.json?key=${API_KEY}`
}

export interface SearchSuggestion {
  address: string
  lat: number
  lng: number
}

export async function geocode(
  query: string,
): Promise<{ lat: number; lng: number; address: string } | null> {
  if (!API_KEY) return null
  try {
    const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json?key=${API_KEY}&limit=1`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const result = data.results?.[0]
    if (!result) return null
    return {
      lat: result.position.lat,
      lng: result.position.lon,
      address: result.address.freeformAddress ?? query,
    }
  } catch {
    return null
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  if (!API_KEY) return null
  try {
    const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lng}.json?key=${API_KEY}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const addr = data.addresses?.[0]?.address
    if (!addr) return null
    return addr.freeformAddress ?? null
  } catch {
    return null
  }
}

export async function fuzzySearch(
  query: string,
  signal?: AbortSignal,
): Promise<SearchSuggestion[]> {
  if (!API_KEY || !query.trim()) return []
  try {
    const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${API_KEY}&typeahead=true&limit=5`
    const res = await fetch(url, { signal })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map(
      (r: { address: { freeformAddress: string }; position: { lat: number; lon: number } }) => ({
        address: r.address.freeformAddress,
        lat: r.position.lat,
        lng: r.position.lon,
      }),
    )
  } catch {
    return []
  }
}
