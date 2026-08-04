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
