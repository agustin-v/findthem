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
    expect(result.segments).toEqual([{ segmentId: 0, status: 'not_assigned', searchedAt: null }]);
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
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/volunteer/search');
    expect(init.headers.Authorization).toBe('Bearer the-token');
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
