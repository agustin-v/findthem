import {
  ApiError,
  createRemark,
  getJoinPreview,
  getVolunteerMessages,
  getVolunteerSearch,
  getVolunteerSession,
  isAuthError,
  isNotFoundError,
  joinSearch,
  reportLocation,
  sendVolunteerMessage,
  updateSegmentStatus,
} from './api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  mockFetch.mockReset();
});

describe('isAuthError', () => {
  it('is true only for a 401 ApiError', () => {
    expect(isAuthError(new ApiError('Unauthorized', 401))).toBe(true);
    expect(isAuthError(new ApiError('Not Found', 404))).toBe(false);
    expect(isAuthError(new Error('network failure'))).toBe(false);
    expect(isAuthError(null)).toBe(false);
  });
});

describe('isNotFoundError', () => {
  it('is true only for a 404 ApiError', () => {
    expect(isNotFoundError(new ApiError('Not Found', 404))).toBe(true);
    expect(isNotFoundError(new ApiError('Unauthorized', 401))).toBe(false);
    expect(isNotFoundError(new Error('network failure'))).toBe(false);
  });
});

describe('getJoinPreview', () => {
  it('encodes the code and maps the response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { subject_type: 'person', subject_name: 'Marco Rossi', area: 'Via del Corso' },
        }),
    });

    const result = await getJoinPreview('AB CD');

    expect(result).toEqual({ subjectType: 'person', subjectName: 'Marco Rossi', area: 'Via del Corso' });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/join/AB%20CD/preview');
  });

  it('throws an ApiError with the response status on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve(null),
    });

    await expect(getJoinPreview('BADCODE')).rejects.toMatchObject({ status: 404 });
  });
});

describe('joinSearch', () => {
  it('sends a flat POST body and maps the created volunteer + token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { id: 'vol-1', status: 'pending', name: 'Giulia', resource_type: 'people' },
          token: 'signed-token',
        }),
    });

    const result = await joinSearch('CODE123', {
      name: 'Giulia',
      phone: '+390698765',
      resourceType: 'people',
      consentName: true,
      consentLocation: true,
      consentPhone: true,
    });

    expect(result).toEqual({
      id: 'vol-1',
      status: 'pending',
      name: 'Giulia',
      resourceType: 'people',
      token: 'signed-token',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/join');
    expect(url).not.toContain('/join/');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      code: 'CODE123',
      name: 'Giulia',
      phone: '+390698765',
      resource_type: 'people',
      consent_name: true,
      consent_location: true,
      consent_phone: true,
    });
  });
});

describe('getVolunteerSession', () => {
  it('attaches the bearer token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'vol-1', status: 'approved', name: 'Giulia' }),
    });

    const result = await getVolunteerSession('the-token');

    expect(result.status).toBe('approved');
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer the-token');
  });

  it('rejects with a 401 ApiError for an invalid token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve(null),
    });

    const error = await getVolunteerSession('bad-token').catch((e) => e);
    expect(isAuthError(error)).toBe(true);
  });
});

describe('getVolunteerSearch', () => {
  it('maps the search, segments, and generation, attaching the bearer token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            search: {
              id: 'search-1',
              subject_type: 'person',
              subject_name: 'Marco Rossi',
              subject_details: {},
              status: 'active',
              contact_phone: '+390612345',
              lkp_lat: 41.9,
              lkp_lng: 12.5,
              lkp_address: 'Via del Corso',
              lkp_at: '2026-08-01T10:00:00Z',
              photo_urls: ['https://signed.example.com/searches/search-1/a.jpg'],
            },
            segments: [{ segment_id: 0, status: 'not_assigned', searched_at: null }],
            generation: {
              id: 'gen-1',
              response: {
                segments: {
                  type: 'FeatureCollection',
                  features: [
                    {
                      type: 'Feature',
                      properties: { segment_id: 0, searchable: true },
                      geometry: { type: 'Polygon', coordinates: [] },
                    },
                  ],
                },
              },
            },
            my_segment_ids: [0],
            remarks: [
              {
                id: 'remark-1',
                search_id: 'search-1',
                volunteer_id: null,
                kind: 'hazard',
                text: 'Bridge is down',
                lat: 41.9,
                lng: 12.5,
                reported_at: '2026-08-19T10:00:00Z',
              },
            ],
            consent_location: true,
          },
        }),
    });

    const result = await getVolunteerSearch('the-token');

    expect(result.search).toEqual({
      id: 'search-1',
      subjectType: 'person',
      subjectName: 'Marco Rossi',
      subjectDetails: {},
      status: 'active',
      contactPhone: '+390612345',
      lkpLat: 41.9,
      lkpLng: 12.5,
      lkpAddress: 'Via del Corso',
      lkpAt: '2026-08-01T10:00:00Z',
      photoUrls: ['https://signed.example.com/searches/search-1/a.jpg'],
    });
    expect(result.segments).toEqual([
      {
        segmentId: 0,
        status: 'not_assigned',
        searchedAt: null,
        locked: false,
        lockedForMe: false,
        lockReason: null,
      },
    ]);
    expect(result.generation?.id).toBe('gen-1');
    expect(result.generation?.segments.features).toHaveLength(1);
    expect(result.mySegmentIds).toEqual([0]);
    // Every remark on the search, not just this volunteer's own (Story 37) —
    // this one has volunteer_id: null, i.e. coordinator-authored.
    expect(result.remarks).toEqual([
      {
        id: 'remark-1',
        searchId: 'search-1',
        volunteerId: null,
        kind: 'hazard',
        text: 'Bridge is down',
        lat: 41.9,
        lng: 12.5,
        reportedAt: '2026-08-19T10:00:00Z',
      },
    ]);
    expect(result.consentLocation).toBe(true);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/volunteer/search');
    expect(init.headers.Authorization).toBe('Bearer the-token');
  });

  it('defaults consentLocation to false when the field is missing (API/mobile version skew)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            search: {
              id: 'search-1',
              subject_type: 'person',
              subject_name: 'Marco Rossi',
              subject_details: {},
              status: 'active',
              contact_phone: '+390612345',
              lkp_lat: null,
              lkp_lng: null,
              lkp_address: null,
              lkp_at: null,
              photo_urls: [],
            },
            segments: [],
            generation: null,
            my_segment_ids: [],
            // consent_location intentionally omitted
          },
        }),
    });

    const result = await getVolunteerSearch('the-token');

    expect(result.consentLocation).toBe(false);
  });

  it('maps a null generation when the search has never been generated', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            search: {
              id: 'search-1',
              subject_type: 'person',
              subject_name: 'Marco Rossi',
              subject_details: {},
              status: 'active',
              contact_phone: '+390612345',
              lkp_lat: null,
              lkp_lng: null,
              lkp_address: null,
              lkp_at: null,
              photo_urls: [],
            },
            segments: [],
            generation: null,
            my_segment_ids: [],
            remarks: [],
          },
        }),
    });

    const result = await getVolunteerSearch('the-token');

    expect(result.generation).toBeNull();
    expect(result.mySegmentIds).toEqual([]);
    expect(result.remarks).toEqual([]);
  });

  it('defaults remarks to an empty array when the field is missing (API/mobile version skew)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            search: {
              id: 'search-1',
              subject_type: 'person',
              subject_name: 'Marco Rossi',
              subject_details: {},
              status: 'active',
              contact_phone: '+390612345',
              lkp_lat: null,
              lkp_lng: null,
              lkp_address: null,
              lkp_at: null,
              photo_urls: [],
            },
            segments: [],
            generation: null,
            my_segment_ids: [],
            // remarks intentionally omitted
          },
        }),
    });

    const result = await getVolunteerSearch('the-token');

    expect(result.remarks).toEqual([]);
  });
});

describe('updateSegmentStatus', () => {
  it('PATCHes the segment status and maps the response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { segment_id: 0, status: 'searched', searched_at: '2026-08-04T10:00:00Z' },
        }),
    });

    const result = await updateSegmentStatus('the-token', 0, 'searched');

    expect(result.status).toBe('searched');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/volunteer/segments/0');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ status: 'searched' });
  });

  it('maps the reduced lock shape from a locked segment response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            segment_id: 0,
            status: 'in_progress',
            searched_at: null,
            locked: true,
            locked_for_me: true,
            lock_reason: 'bridge is out',
          },
        }),
    });

    const result = await updateSegmentStatus('the-token', 0, 'in_progress');

    expect(result.locked).toBe(true);
    expect(result.lockedForMe).toBe(true);
    expect(result.lockReason).toBe('bridge is out');
  });

  it('includes occurred_at and generation_id when provided (offline outbox replay)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { segment_id: 0, status: 'searched', searched_at: '2026-08-04T09:00:00Z' },
        }),
    });

    await updateSegmentStatus('the-token', 0, 'searched', {
      occurredAt: '2026-08-04T09:00:00Z',
      generationId: 'gen-1',
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      status: 'searched',
      occurred_at: '2026-08-04T09:00:00Z',
      generation_id: 'gen-1',
    });
  });

  it('throws an ApiError with the segment-locked detail on a 409', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: () => Promise.resolve({ errors: { segment: ['locked'] } }),
    });

    await expect(updateSegmentStatus('the-token', 0, 'searched')).rejects.toMatchObject({
      status: 409,
      errors: { segment: ['locked'] },
    });
  });
});

describe('createRemark', () => {
  it('wraps the payload under a "remark" key with snake_case fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            id: 'remark-1',
            search_id: 'search-1',
            volunteer_id: 'vol-1',
            kind: 'sighting',
            text: 'Saw a red jacket',
            lat: 41.9,
            lng: 12.5,
            reported_at: '2026-08-04T10:00:00Z',
          },
        }),
    });

    const result = await createRemark('the-token', {
      id: 'remark-1',
      kind: 'sighting',
      text: 'Saw a red jacket',
      lat: 41.9,
      lng: 12.5,
      reportedAt: '2026-08-04T10:00:00Z',
    });

    expect(result.kind).toBe('sighting');
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      remark: {
        id: 'remark-1',
        kind: 'sighting',
        text: 'Saw a red jacket',
        lat: 41.9,
        lng: 12.5,
        reported_at: '2026-08-04T10:00:00Z',
      },
    });
  });
});

describe('reportLocation', () => {
  it('POSTs the ping with a bearer token and snake_case fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { id: 'loc-1', volunteer_id: 'vol-1', lat: 41.9, lng: 12.5, recorded_at: '2026-08-20T10:00:00Z' },
        }),
    });

    await reportLocation('the-token', { lat: 41.9, lng: 12.5, recordedAt: '2026-08-20T10:00:00Z' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/volunteer/location');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer the-token');
    expect(JSON.parse(init.body)).toEqual({
      lat: 41.9,
      lng: 12.5,
      recorded_at: '2026-08-20T10:00:00Z',
    });
  });

  it('rejects with an ApiError on a 403 (consent declined server-side)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ errors: { location: ['consent not granted'] } }),
    });

    const error = await reportLocation('the-token', {
      lat: 41.9,
      lng: 12.5,
      recordedAt: '2026-08-20T10:00:00Z',
    }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
  });
});

describe('getVolunteerMessages', () => {
  it('maps the thread and attaches the bearer token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: 'msg-1',
              search_id: 'search-1',
              volunteer_id: 'vol-1',
              sender: 'coordinator',
              text: 'Cleared for Zone B-4',
              inserted_at: '2026-08-01T09:32:00Z',
            },
          ],
        }),
    });

    const result = await getVolunteerMessages('the-token');

    expect(result).toEqual([
      {
        id: 'msg-1',
        searchId: 'search-1',
        volunteerId: 'vol-1',
        sender: 'coordinator',
        text: 'Cleared for Zone B-4',
        sentAt: null,
        insertedAt: '2026-08-01T09:32:00Z',
      },
    ]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/volunteer/messages');
    expect(init.headers.Authorization).toBe('Bearer the-token');
  });
});

describe('sendVolunteerMessage', () => {
  it('POSTs the client-generated id and text — never a sender', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            id: 'msg-2',
            search_id: 'search-1',
            volunteer_id: 'vol-1',
            sender: 'volunteer',
            text: 'On it. Heading in now.',
            inserted_at: '2026-08-01T09:33:00Z',
          },
        }),
    });

    const result = await sendVolunteerMessage('the-token', { id: 'msg-2', text: 'On it. Heading in now.' });

    expect(result.sender).toBe('volunteer');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/volunteer/messages');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer the-token');
    const body = JSON.parse(init.body);
    expect(body).toEqual({ message: { id: 'msg-2', text: 'On it. Heading in now.' } });
    // sender is never sent from the client — the backend forces it from
    // the authenticated identity (VolunteerMessageController.create).
    expect(body.message.sender).toBeUndefined();
  });

  it('includes sent_at when provided (offline outbox replay)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            id: 'msg-2',
            search_id: 'search-1',
            volunteer_id: 'vol-1',
            sender: 'volunteer',
            text: 'Composed offline',
            sent_at: '2026-08-01T08:00:00Z',
            inserted_at: '2026-08-01T09:33:00Z',
          },
        }),
    });

    const result = await sendVolunteerMessage('the-token', {
      id: 'msg-2',
      text: 'Composed offline',
      sentAt: '2026-08-01T08:00:00Z',
    });

    expect(result.sentAt).toBe('2026-08-01T08:00:00Z');
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body).message.sent_at).toBe('2026-08-01T08:00:00Z');
  });
});

describe('request timeout', () => {
  it('aborts and rejects if the server never responds', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const promise = getVolunteerSession('slow-token');
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;

    vi.useRealTimers();
  });
});
