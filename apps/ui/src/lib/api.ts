import { apiClient } from './api-client'
import type { SegmentsMeta, SegmentsResponse } from './geo-api'

export type SegmentStatus = 'not_assigned' | 'assigned' | 'in_progress' | 'searched'

export interface SegmentStatusEntry {
  segmentId: number
  status: SegmentStatus
  searchedAt: string | null
}

interface RemoteSegmentStatus {
  segment_id: number
  status: SegmentStatus
  searched_at: string | null
}

function mapSegmentStatus(remote: RemoteSegmentStatus): SegmentStatusEntry {
  return { segmentId: remote.segment_id, status: remote.status, searchedAt: remote.searched_at }
}

export interface SegmentAssignment {
  segmentId: number
  volunteerId: string
  assignedAt: string
}

interface RemoteSegmentAssignment {
  segment_id: number
  volunteer_id: string
  assigned_at: string
}

function mapSegmentAssignment(remote: RemoteSegmentAssignment): SegmentAssignment {
  return { segmentId: remote.segment_id, volunteerId: remote.volunteer_id, assignedAt: remote.assigned_at }
}

export interface Search {
  id: string
  subjectType: 'person' | 'animal' | 'object'
  subjectName: string
  status: 'active' | 'suspended' | 'resolved'
  createdAt: Date
  volunteerCount: number
  segmentsSearched: number
  totalSegments: number
}

export interface SearchDetail extends Search {
  lastSeenLocation: string
  lastSeenAt: string
  lastSeenCoords?: { lat: number; lng: number }
  details: Record<string, string>
  joinToken: string
}

export type VolunteerStatus = 'pending' | 'approved' | 'removed'

export interface Volunteer {
  id: string
  name: string
  phone: string
  resourceType: string | null
  status: VolunteerStatus
  lastActiveAt: string | null
  joinedAt: string
  approvedAt: string | null
  removedAt: string | null
  segmentsSearched: number
}

export interface CreateSearchInput {
  subjectType: 'person' | 'animal' | 'object'
  [key: string]: unknown
}

export interface GenerateSearchParams {
  radiusKm?: number
  h3Resolution?: number
  resources?: { type: string; count: number }[]
}

interface RemoteGeneration {
  id: string
  meta: SegmentsMeta
  response: SegmentsResponse
  inserted_at: string
}

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
  segments_searched: number
  total_segments: number
  join_token: string
}

interface RemoteVolunteer {
  id: string
  name: string
  phone: string
  resource_type: string | null
  status: VolunteerStatus
  last_active_at: string | null
  joined_at: string
  approved_at: string | null
  removed_at: string | null
  segments_searched: number | null
}

export interface JoinPreview {
  subjectType: 'person' | 'animal' | 'object'
  subjectName: string
  area: string | null
}

interface RemoteJoinPreview {
  subject_type: 'person' | 'animal' | 'object'
  subject_name: string
  area: string | null
}

function mapVolunteer(remote: RemoteVolunteer): Volunteer {
  return {
    id: remote.id,
    name: remote.name,
    phone: remote.phone,
    resourceType: remote.resource_type,
    status: remote.status,
    lastActiveAt: remote.last_active_at,
    joinedAt: remote.joined_at,
    approvedAt: remote.approved_at,
    removedAt: remote.removed_at,
    segmentsSearched: remote.segments_searched ?? 0,
  }
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
    segmentsSearched: remote.segments_searched,
    totalSegments: remote.total_segments,
    lastSeenLocation: remote.lkp_address ?? '',
    lastSeenAt: remote.lkp_at ?? '',
    lastSeenCoords:
      remote.lkp_lat != null && remote.lkp_lng != null
        ? { lat: remote.lkp_lat, lng: remote.lkp_lng }
        : undefined,
    details,
    joinToken: remote.join_token,
  }
}

const OMIT_FROM_SUBJECT_DETAILS = new Set([
  'subjectType',
  'resources',
  'photos',
  'contactPhone',
  'lastSeenLocation',
  'lastSeenAt',
  'lastSeenCoords',
])

function buildCreatePayload(data: CreateSearchInput) {
  const { subjectType, name, contactPhone, lastSeenLocation, lastSeenAt, lastSeenCoords } = data
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
      contact_phone: (contactPhone as string) ?? '',
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
    rotateJoinToken: async (searchId: string): Promise<string> => {
      const { data } = await apiClient.post<{ data: { join_token: string } }>(
        `/api/searches/${searchId}/join_token/rotate`,
      )
      return data.join_token
    },
    generate: async (searchId: string, params: GenerateSearchParams): Promise<SegmentsResponse> => {
      const { data } = await apiClient.post<{ data: RemoteGeneration }>(
        `/api/searches/${searchId}/generate`,
        {
          radius_km: params.radiusKm,
          h3_resolution: params.h3Resolution,
          resources: params.resources,
        },
      )
      return data.response
    },
    getLatestGeneration: async (searchId: string): Promise<SegmentsResponse | null> => {
      const { data } = await apiClient.get<{ data: RemoteGeneration | null }>(
        `/api/searches/${searchId}/generations/latest`,
      )
      return data ? data.response : null
    },
  },
  volunteers: {
    listBySearch: async (searchId: string): Promise<Volunteer[]> => {
      const { data } = await apiClient.get<{ data: RemoteVolunteer[] }>(
        `/api/searches/${searchId}/volunteers`,
      )
      return data.map(mapVolunteer)
    },
    setStatus: async (
      searchId: string,
      volunteerId: string,
      status: 'approved' | 'removed',
    ): Promise<Volunteer> => {
      const { data } = await apiClient.patch<{ data: RemoteVolunteer }>(
        `/api/searches/${searchId}/volunteers/${volunteerId}`,
        { status },
      )
      return mapVolunteer(data)
    },
  },
  join: {
    preview: async (code: string): Promise<JoinPreview> => {
      const { data } = await apiClient.get<{ data: RemoteJoinPreview }>(
        `/join/${encodeURIComponent(code)}/preview`,
      )
      return { subjectType: data.subject_type, subjectName: data.subject_name, area: data.area }
    },
  },
  segments: {
    getBySearch: async (searchId: string): Promise<SegmentStatusEntry[]> => {
      const { data } = await apiClient.get<{ data: RemoteSegmentStatus[] }>(
        `/api/searches/${searchId}/segments`,
      )
      return data.map(mapSegmentStatus)
    },
    updateStatus: async (
      searchId: string,
      segmentId: number,
      newStatus: SegmentStatus,
    ): Promise<SegmentStatusEntry> => {
      const { data } = await apiClient.patch<{ data: RemoteSegmentStatus }>(
        `/api/searches/${searchId}/segments/${segmentId}`,
        { status: newStatus },
      )
      return mapSegmentStatus(data)
    },
  },
  segmentAssignments: {
    getBySearch: async (searchId: string): Promise<SegmentAssignment[]> => {
      const { data } = await apiClient.get<{ data: RemoteSegmentAssignment[] }>(
        `/api/searches/${searchId}/segment_assignments`,
      )
      return data.map(mapSegmentAssignment)
    },
    assign: async (
      searchId: string,
      segmentId: number,
      volunteerId: string,
    ): Promise<SegmentAssignment> => {
      const { data } = await apiClient.post<{ data: RemoteSegmentAssignment }>(
        `/api/searches/${searchId}/segment_assignments`,
        { segment_id: segmentId, volunteer_id: volunteerId },
      )
      return mapSegmentAssignment(data)
    },
    unassign: async (searchId: string, segmentId: number, volunteerId: string): Promise<void> => {
      await apiClient.delete(`/api/searches/${searchId}/segment_assignments/${segmentId}/${volunteerId}`)
    },
  },
}
