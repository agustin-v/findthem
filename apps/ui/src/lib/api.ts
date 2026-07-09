import { latLngToCell, gridDisk } from 'h3-js'
import type { Zone, ZoneStatus, ZonesResponse } from './zones'

export interface LoginInput {
  email: string
  password: string
}

export interface SignupInput {
  fullName: string
  email: string
  password: string
  confirmPassword: string
}

export interface User {
  name: string
  email: string
}

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

// --- Search store (session-scoped mock persistence) ---

let nextSearchId = 3
const searchStore = new Map<string, SearchDetail>()

export const api = {
  auth: {
    login: async (data: LoginInput) => {
      await delay(1000)
      return { token: 'mock_token', user: { name: 'Test User', email: data.email } }
    },
    signup: async (data: SignupInput) => {
      await delay(1000)
      return { token: 'mock_token', user: { name: data.fullName, email: data.email } }
    },
  },
  searches: {
    list: async (): Promise<Search[]> => {
      await delay(800)
      const hardcoded: Search[] = [
        {
          id: '1',
          subjectType: 'person',
          subjectName: 'Marco Rossi',
          status: 'active',
          createdAt: new Date(Date.now() - 3600000 * 2),
          volunteerCount: 4,
          zonesSearched: 3,
          totalZones: 19,
        },
        {
          id: '2',
          subjectType: 'animal',
          subjectName: 'Golden Retriever — Lupo',
          status: 'resolved',
          createdAt: new Date(Date.now() - 3600000 * 48),
          volunteerCount: 6,
          zonesSearched: 19,
          totalZones: 19,
        },
      ]
      const dynamic = [...searchStore.values()] as Search[]
      return [...dynamic, ...hardcoded]
    },
    getById: async (id: string): Promise<SearchDetail> => {
      await delay(600)
      const details: Record<string, SearchDetail> = {
        '1': {
          id: '1',
          subjectType: 'person',
          subjectName: 'Marco Rossi',
          status: 'active',
          createdAt: new Date(Date.now() - 3600000 * 2),
          volunteerCount: 4,
          zonesSearched: 3,
          totalZones: 19,
          lastSeenLocation: 'Via del Corso 12, Roma',
          lastSeenAt: '2026-05-07T14:30:00Z',
          lastSeenCoords: { lat: 41.9028, lng: 12.4964 },
          details: {
            age: '72',
            physicalDescription: '175cm, grey hair, brown eyes',
            healthNotes: 'Mild dementia',
            phone: '+39 06 1234567',
          },
        },
        '2': {
          id: '2',
          subjectType: 'animal',
          subjectName: 'Golden Retriever — Lupo',
          status: 'resolved',
          createdAt: new Date(Date.now() - 3600000 * 48),
          volunteerCount: 6,
          zonesSearched: 19,
          totalZones: 19,
          lastSeenLocation: 'Parco della Caffarella, Roma',
          lastSeenAt: '2026-05-05T10:00:00Z',
          lastSeenCoords: { lat: 41.8614, lng: 12.5244 },
          details: {
            speciesBreed: 'Golden Retriever',
            behaviourNotes: 'Friendly, responds to "Lupo"',
            microchip: '380260000123456',
          },
        },
      }
      const result = searchStore.get(id) ?? details[id]
      if (!result) throw new Error('Search not found')
      return result
    },
    create: async (data: CreateSearchInput) => {
      await delay(1000)
      const id = String(nextSearchId++)
      const subjectName =
        (data.name as string) ??
        (data.speciesBreed as string) ??
        (data.description as string) ??
        'Unknown'
      const coords = data.lastSeenCoords as { lat: number; lng: number } | undefined
      const detail: SearchDetail = {
        id,
        subjectType: data.subjectType,
        subjectName,
        status: 'active',
        createdAt: new Date(),
        volunteerCount: 0,
        zonesSearched: 0,
        totalZones: 0,
        lastSeenLocation: (data.lastSeenLocation as string) ?? '',
        lastSeenAt: (data.lastSeenAt as string) ?? new Date().toISOString(),
        lastSeenCoords: coords,
        details: {},
      }
      searchStore.set(id, detail)
      if (coords) {
        SEARCH_CENTERS[id] = coords
      }
      return { id, ...data }
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
