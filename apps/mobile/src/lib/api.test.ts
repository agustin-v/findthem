import {
  ApiError,
  getJoinPreview,
  getVolunteerSession,
  isAuthError,
  isNotFoundError,
  joinSearch,
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
