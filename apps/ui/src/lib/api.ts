import { latLngToCell, gridDisk } from 'h3-js'
import { apiClient } from './api-client'
import type { Zone, ZoneStatus, ZonesResponse } from './zones'

export interface Search {
  id: string
  subjectType: 'person' | 'animal' | 'object'
  subjectName: string
  status: 'active' | 'suspended' | 'resolved'
  createdAt: Date
  volunteerCount: number
  zonesSearched: number
  totalZones: number
}

export interface SearchDetail extends Search {
  lastSeenLocation: string
  lastSeenAt: string
  lastSeenCoords?: { lat: number; lng: number }
  details: Record<string, string>
}

export interface Volunteer {
  id: string
  name: string
  avatarUrl?: string
  online: boolean
}

export interface CreateSearchInput {
  subjectType: 'person' | 'animal' | 'object'
  [key: string]: unknown
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// --- Real backend mapping (apps/api) ---
// The API returns snake_case; these types/mapper translate it to the
// camelCase shape the rest of the UI already expects.

interface RemoteSearch {
  id: string
  subject_type: 'person' | 'animal' | 'object'
  subject_name: string
  subject_details: Record<string, unknown>
  status: 'active' | 'suspended' | 'resolved'
  lkp_lat: number | null
  lkp_lng: number | null
  lkp_address: string | null
  lkp_at: string | null
  inserted_at: string
  volunteer_count: number
  zones_searched: number
  total_zones: number
}

function mapSearch(remote: RemoteSearch): SearchDetail {
  const details: Record<string, string> = {}
  for (const [key, value] of Object.entries(remote.subject_details)) {
    details[key] = String(value)
  }

  return {
    id: remote.id,
    subjectType: remote.subject_type,
    subjectName: remote.subject_name,
    status: remote.status,
    createdAt: new Date(remote.inserted_at),
    volunteerCount: remote.volunteer_count,
    zonesSearched: remote.zones_searched,
    totalZones: remote.total_zones,
    lastSeenLocation: remote.lkp_address ?? '',
    lastSeenAt: remote.lkp_at ?? '',
    lastSeenCoords:
      remote.lkp_lat != null && remote.lkp_lng != null
        ? { lat: remote.lkp_lat, lng: remote.lkp_lng }
        : undefined,
    details,
  }
}

const OMIT_FROM_SUBJECT_DETAILS = new Set([
  'subjectType',
  'resources',
  'photos',
  'phone',
  'lastSeenLocation',
  'lastSeenAt',
  'lastSeenCoords',
])

function buildCreatePayload(data: CreateSearchInput) {
  const { subjectType, name, phone, lastSeenLocation, lastSeenAt, lastSeenCoords } = data
  const coords = lastSeenCoords as { lat: number; lng: number } | undefined
  const rest = Object.fromEntries(
    Object.entries(data).filter(([key]) => !OMIT_FROM_SUBJECT_DETAILS.has(key)),
  )

  const subjectName =
    (name as string) ?? (rest.speciesBreed as string) ?? (rest.description as string) ?? 'Unknown'

  return {
    search: {
      subject_type: subjectType,
      subject_name: subjectName,
      subject_details: rest,
      contact_phone: (phone as string) ?? '',
      lkp_address: (lastSeenLocation as string) ?? undefined,
      lkp_at: lastSeenAt ? new Date(lastSeenAt as string).toISOString() : undefined,
      lkp_lat: coords?.lat,
      lkp_lng: coords?.lng,
    },
  }
}

export const api = {
  searches: {
    list: async (): Promise<Search[]> => {
      const { data } = await apiClient.get<{ data: RemoteSearch[] }>('/api/searches')
      return data.map(mapSearch)
    },
    getById: async (id: string): Promise<SearchDetail> => {
      const { data } = await apiClient.get<{ data: RemoteSearch }>(`/api/searches/${id}`)
      return mapSearch(data)
    },
    create: async (data: CreateSearchInput) => {
      const { data: created } = await apiClient.post<{ data: RemoteSearch }>(
        '/api/searches',
        buildCreatePayload(data),
      )
      return mapSearch(created)
    },
  },
  volunteers: {
    listBySearch: async (searchId: string): Promise<Volunteer[]> => {
      await delay(500)
      const data: Record<string, Volunteer[]> = {
        '1': [
          { id: 'v1', name: 'Giulia Bianchi', online: true },
          { id: 'v2', name: 'Luca Moretti', online: true },
          { id: 'v3', name: 'Sofia Conti', online: false },
          { id: 'v4', name: 'Alessandro Ricci', online: true },
        ],
        '2': [
          { id: 'v5', name: 'Elena Ferrara', online: false },
          { id: 'v6', name: 'Marco De Luca', online: false },
          { id: 'v7', name: 'Chiara Romano', online: true },
          { id: 'v8', name: 'Davide Russo', online: false },
          { id: 'v9', name: 'Francesca Gallo', online: true },
          { id: 'v10', name: 'Matteo Colombo', online: false },
        ],
      }
      return data[searchId] ?? []
    },
  },
  zones: {
    getBySearch: async (searchId: string): Promise<ZonesResponse> => {
      await delay(700)
      return { searchId, zones: getOrCreateZones(searchId) }
    },
    updateStatus: async (searchId: string, h3Index: string, newStatus: ZoneStatus): Promise<Zone> => {
      await delay(300)
      const zones = getOrCreateZones(searchId)
      const zone = zones.find((z) => z.h3Index === h3Index)
      if (!zone) throw new Error('Zone not found')
      zone.status = newStatus
      if (newStatus === 'searched') zone.searchedAt = Date.now()
      return { ...zone }
    },
  },
}

// --- Zone store (session-scoped mock persistence) ---

const zoneStore = new Map<string, Zone[]>()

const SEARCH_CENTERS: Record<string, { lat: number; lng: number }> = {
  '1': { lat: 41.9028, lng: 12.4964 },
  '2': { lat: 41.8614, lng: 12.5244 },
}

function getOrCreateZones(searchId: string): Zone[] {
  if (zoneStore.has(searchId)) return zoneStore.get(searchId)!

  const center = SEARCH_CENTERS[searchId]
  if (!center) return []

  const centerCell = latLngToCell(center.lat, center.lng, 9)
  const hexes = gridDisk(centerCell, 2)

  let zones: Zone[]

  if (searchId === '1') {
    zones = hexes.map((h3Index, i): Zone => {
      if (i === 0) return { h3Index, status: 'searched', searchedAt: Date.now() - 0.5 * 3_600_000 }
      if (i === 1) return { h3Index, status: 'searched', searchedAt: Date.now() - 1.5 * 3_600_000 }
      if (i === 2) return { h3Index, status: 'searched', searchedAt: Date.now() - 3 * 3_600_000 }
      return { h3Index, status: 'not_assigned' }
    })
  } else {
    zones = hexes.map((h3Index): Zone => ({
      h3Index,
      status: 'searched',
      searchedAt: Date.now() - 5 * 3_600_000,
    }))
  }

  zoneStore.set(searchId, zones)
  return zones
}
