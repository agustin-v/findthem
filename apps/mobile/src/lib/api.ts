import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { SegmentProperties, SegmentStatus } from './segments';

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
  photoUrls: string[];
}

export interface VolunteerSegment {
  segmentId: number;
  status: SegmentStatus;
  searchedAt: string | null;
  // Story #52/#56 — the reduced volunteer-facing lock shape: never a raw
  // user/volunteer id, just enough to render "locked" and know whether
  // *this* volunteer is the one it's reserved for.
  locked: boolean;
  lockedForMe: boolean;
  lockReason: string | null;
}

// The polygon geometry itself — apps/geo's own segment shapes, persisted
// as-is on the Generation and returned here so the volunteer app never
// needs to reconstruct geometry client-side (unlike the old h3-js-based
// per-cell zones, this is real GeoJSON straight from apps/geo).
export interface VolunteerGeneration {
  // The generation's own id — Story #54's outbox stamps this onto a
  // queued mark_segment action at enqueue time, so the backend can reject
  // a stale replay (a segment_id reused by a since-regenerated,
  // physically different polygon) instead of silently marking the wrong
  // one searched.
  id: string;
  segments: FeatureCollection<Polygon | MultiPolygon, SegmentProperties>;
}

export interface VolunteerSearchData {
  search: VolunteerSearchInfo;
  segments: VolunteerSegment[];
  generation: VolunteerGeneration | null;
  mySegmentIds: number[];
  // Every remark on the search, coordinator- and volunteer-authored alike —
  // a shared map-annotation board (Story 37), not just this volunteer's
  // own. map.tsx only renders the ones with a lat/lng.
  remarks: Remark[];
  // This volunteer's own consent — the server-authoritative source Story
  // 40's foreground location reporting gates on. POST /join's form
  // requires all three consents client-side today, but that's a client
  // policy, not a server guarantee, so this is checked rather than assumed.
  consentLocation: boolean;
}

interface RemoteSegment {
  segment_id: number;
  status: SegmentStatus;
  searched_at: string | null;
  locked: boolean;
  locked_for_me: boolean;
  lock_reason: string | null;
}

interface RemoteGeneration {
  id: string;
  response: {
    segments: FeatureCollection<Polygon | MultiPolygon, SegmentProperties>;
  };
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
    photo_urls: string[];
  };
  segments: RemoteSegment[];
  generation: RemoteGeneration | null;
  my_segment_ids: number[];
  remarks: RemoteRemark[];
  consent_location: boolean;
}

function mapVolunteerSegment(segment: RemoteSegment): VolunteerSegment {
  return {
    segmentId: segment.segment_id,
    status: segment.status,
    searchedAt: segment.searched_at,
    locked: segment.locked ?? false,
    lockedForMe: segment.locked_for_me ?? false,
    lockReason: segment.lock_reason ?? null,
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
      photoUrls: data.search.photo_urls,
    },
    segments: data.segments.map(mapVolunteerSegment),
    generation: data.generation
      ? { id: data.generation.id, segments: data.generation.response.segments }
      : null,
    mySegmentIds: data.my_segment_ids,
    remarks: data.remarks?.map(mapRemark) ?? [],
    consentLocation: data.consent_location ?? false,
  };
}

export interface UpdateSegmentStatusOptions {
  // Client-supplied, server-clamped (Story #54's offline outbox) — when
  // this action was actually performed, not when it happened to sync.
  // Omitted for a live, in-the-moment tap (the backend falls back to its
  // own receipt time, same as before this option existed).
  occurredAt?: string;
  // The generation that was current when this action was enqueued — the
  // backend rejects a mismatch against the search's *current* generation
  // as stale (409) rather than silently marking a since-regenerated,
  // physically different polygon as searched. Omitted for a live write,
  // where the race this guards against is milliseconds, not hours.
  generationId?: string;
}

export async function updateSegmentStatus(
  token: string,
  segmentId: number,
  status: SegmentStatus,
  options: UpdateSegmentStatusOptions = {},
): Promise<VolunteerSegment> {
  const { data } = await request<{ data: RemoteSegment }>(
    `/volunteer/segments/${segmentId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        status,
        occurred_at: options.occurredAt,
        generation_id: options.generationId,
      }),
    },
  );

  return mapVolunteerSegment(data);
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

function mapRemark(remote: RemoteRemark): Remark {
  return {
    id: remote.id,
    searchId: remote.search_id,
    volunteerId: remote.volunteer_id,
    kind: remote.kind,
    text: remote.text,
    lat: remote.lat,
    lng: remote.lng,
    reportedAt: remote.reported_at,
  };
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

  return mapRemark(data);
}

export interface LocationPingPayload {
  lat: number;
  lng: number;
  recordedAt: string;
}

// Fire-and-forget from the caller's perspective (useLocationReporting
// swallows every rejection — a dropped ping isn't worth surfacing to the
// volunteer, and the next one is only ~15m/60s away) — but this function
// itself still surfaces the real error/status rather than hiding it, so a
// caller that DOES want to react (or a test) isn't stuck guessing.
export async function reportLocation(token: string, payload: LocationPingPayload): Promise<void> {
  await request('/volunteer/location', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      lat: payload.lat,
      lng: payload.lng,
      recorded_at: payload.recordedAt,
    }),
  });
}

export type MessageSender = 'coordinator' | 'volunteer';

export interface Message {
  id: string;
  searchId: string;
  volunteerId: string;
  sender: MessageSender;
  text: string;
  // Client-supplied, server-clamped (Story #54's offline outbox) — when
  // the volunteer actually sent this, not when it happened to sync.
  // Optional since the coordinator's own send path doesn't set this yet
  // (the backend falls back to its own receipt time).
  sentAt: string | null;
  insertedAt: string;
}

interface RemoteMessage {
  id: string;
  search_id: string;
  volunteer_id: string;
  sender: MessageSender;
  text: string;
  sent_at: string | null;
  inserted_at: string;
}

function mapMessage(remote: RemoteMessage): Message {
  return {
    id: remote.id,
    searchId: remote.search_id,
    volunteerId: remote.volunteer_id,
    sender: remote.sender,
    text: remote.text,
    sentAt: remote.sent_at ?? null,
    insertedAt: remote.inserted_at,
  };
}

// The volunteer's own 1:1 thread with the coordinator — the backend scopes
// this to the requesting volunteer's own messages only (Messages.
// list_by_search_and_volunteer/2), never other volunteers' threads.
export async function getVolunteerMessages(token: string): Promise<Message[]> {
  const { data } = await request<{ data: RemoteMessage[] }>('/volunteer/messages', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.map(mapMessage);
}

export interface SendMessagePayload {
  id: string;
  text: string;
  // Story #54's offline outbox — when this was actually composed/sent,
  // clamped server-side against sync time. Optional so every existing
  // call site (this function had no such concept before) keeps compiling
  // and working unchanged.
  sentAt?: string;
}

// sender is never sent from the client — the backend forces it to
// "volunteer" from the authenticated identity (VolunteerMessageController).
export async function sendVolunteerMessage(token: string, payload: SendMessagePayload): Promise<Message> {
  const { data } = await request<{ data: RemoteMessage }>('/volunteer/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      message: { id: payload.id, text: payload.text, sent_at: payload.sentAt },
    }),
  });
  return mapMessage(data);
}
