import type { ZoneStatus } from './zones';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const REQUEST_TIMEOUT_MS = 10000;

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(message: string, status: number, errors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

// Only a definitive "this token is invalid" response should ever clear a
// stored session — a network blip, timeout, or 5xx is transient and must
// not be treated the same as an expired/removed volunteer.
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(res.statusText, res.status, body?.errors);
    }

    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

export type SubjectType = 'person' | 'animal' | 'object';
export type ResourceType = 'people' | 'motorbikes' | 'cars' | 'drones';
export type VolunteerStatus = 'pending' | 'approved' | 'removed';

export interface JoinPreview {
  subjectType: SubjectType;
  subjectName: string;
  area: string | null;
}

interface RemotePreview {
  subject_type: SubjectType;
  subject_name: string;
  area: string | null;
}

export async function getJoinPreview(code: string): Promise<JoinPreview> {
  const { data } = await request<{ data: RemotePreview }>(
    `/join/${encodeURIComponent(code)}/preview`,
  );
  return { subjectType: data.subject_type, subjectName: data.subject_name, area: data.area };
}

export interface JoinPayload {
  name: string;
  phone: string;
  resourceType?: ResourceType;
  consentName: boolean;
  consentLocation: boolean;
  consentPhone: boolean;
}

export interface JoinResult {
  id: string;
  status: VolunteerStatus;
  name: string;
  resourceType: string | null;
  token: string;
}

interface RemoteJoinCreated {
  data: {
    id: string;
    status: VolunteerStatus;
    name: string;
    resource_type: string | null;
  };
  token: string;
}

export async function joinSearch(code: string, payload: JoinPayload): Promise<JoinResult> {
  const body = await request<RemoteJoinCreated>('/join', {
    method: 'POST',
    body: JSON.stringify({
      code,
      name: payload.name,
      phone: payload.phone,
      resource_type: payload.resourceType,
      consent_name: payload.consentName,
      consent_location: payload.consentLocation,
      consent_phone: payload.consentPhone,
    }),
  });

  return {
    id: body.data.id,
    status: body.data.status,
    name: body.data.name,
    resourceType: body.data.resource_type,
    token: body.token,
  };
}

export interface VolunteerSession {
  id: string;
  status: VolunteerStatus;
  name: string;
}

export async function getVolunteerSession(token: string): Promise<VolunteerSession> {
  return request<VolunteerSession>('/volunteer/session', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface VolunteerSearchInfo {
  id: string;
  subjectType: SubjectType;
  subjectName: string;
  subjectDetails: Record<string, unknown>;
  status: 'active' | 'suspended' | 'resolved';
  contactPhone: string;
  lkpLat: number | null;
  lkpLng: number | null;
  lkpAddress: string | null;
  lkpAt: string | null;
}

export interface VolunteerZone {
  h3Index: string;
  status: ZoneStatus;
  segmentId: string | null;
  searchedAt: string | null;
}

export interface VolunteerSearchData {
  search: VolunteerSearchInfo;
  zones: VolunteerZone[];
}

interface RemoteZone {
  h3_index: string;
  status: ZoneStatus;
  segment_id: string | null;
  searched_at: string | null;
}

interface RemoteVolunteerSearchData {
  search: {
    id: string;
    subject_type: SubjectType;
    subject_name: string;
    subject_details: Record<string, unknown>;
    status: 'active' | 'suspended' | 'resolved';
    contact_phone: string;
    lkp_lat: number | null;
    lkp_lng: number | null;
    lkp_address: string | null;
    lkp_at: string | null;
  };
  zones: RemoteZone[];
}

function mapVolunteerZone(zone: RemoteZone): VolunteerZone {
  return {
    h3Index: zone.h3_index,
    status: zone.status,
    segmentId: zone.segment_id,
    searchedAt: zone.searched_at,
  };
}

export async function getVolunteerSearch(token: string): Promise<VolunteerSearchData> {
  const { data } = await request<{ data: RemoteVolunteerSearchData }>('/volunteer/search', {
    headers: { Authorization: `Bearer ${token}` },
  });

  return {
    search: {
      id: data.search.id,
      subjectType: data.search.subject_type,
      subjectName: data.search.subject_name,
      subjectDetails: data.search.subject_details,
      status: data.search.status,
      contactPhone: data.search.contact_phone,
      lkpLat: data.search.lkp_lat,
      lkpLng: data.search.lkp_lng,
      lkpAddress: data.search.lkp_address,
      lkpAt: data.search.lkp_at,
    },
    zones: data.zones.map(mapVolunteerZone),
  };
}

export async function updateZoneStatus(
  token: string,
  h3Index: string,
  status: ZoneStatus,
): Promise<VolunteerZone> {
  const { data } = await request<{ data: RemoteZone }>(
    `/volunteer/zones/${encodeURIComponent(h3Index)}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    },
  );

  return mapVolunteerZone(data);
}

export type RemarkKind = 'sighting' | 'hazard' | 'note';

export interface RemarkPayload {
  id: string;
  kind: RemarkKind;
  text?: string;
  lat?: number;
  lng?: number;
  reportedAt: string;
}

export interface Remark {
  id: string;
  searchId: string;
  volunteerId: string | null;
  kind: string;
  text: string | null;
  lat: number | null;
  lng: number | null;
  reportedAt: string;
}

interface RemoteRemark {
  id: string;
  search_id: string;
  volunteer_id: string | null;
  kind: string;
  text: string | null;
  lat: number | null;
  lng: number | null;
  reported_at: string;
}

export async function createRemark(token: string, payload: RemarkPayload): Promise<Remark> {
  const { data } = await request<{ data: RemoteRemark }>('/volunteer/remarks', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      remark: {
        id: payload.id,
        kind: payload.kind,
        text: payload.text,
        lat: payload.lat,
        lng: payload.lng,
        reported_at: payload.reportedAt,
      },
    }),
  });

  return {
    id: data.id,
    searchId: data.search_id,
    volunteerId: data.volunteer_id,
    kind: data.kind,
    text: data.text,
    lat: data.lat,
    lng: data.lng,
    reportedAt: data.reported_at,
  };
}
