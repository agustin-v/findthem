import { api } from './api'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

afterEach(() => {
  mockFetch.mockReset()
})

const remoteSearch = {
  id: 'search-1',
  subject_type: 'person',
  subject_name: 'Marco Rossi',
  subject_details: {},
  status: 'active',
  lkp_lat: 41.9,
  lkp_lng: 12.5,
  lkp_address: 'Piazza del Popolo',
  lkp_at: '2026-08-01T10:00:00Z',
  inserted_at: '2026-08-01T09:00:00Z',
  volunteer_count: 2,
  zones_searched: 3,
  total_zones: 10,
  join_token: 'ABCDE12345',
}

describe('api.join.preview', () => {
  it('maps a valid code preview to the UI shape', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: { subject_type: 'person', subject_name: 'Marco Rossi', area: 'Via del Corso' },
        }),
    })

    const result = await api.join.preview('ABC123')

    expect(result).toEqual({ subjectType: 'person', subjectName: 'Marco Rossi', area: 'Via del Corso' })
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/join/ABC123/preview')
  })

  it('throws for an invalid code', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve(null),
    })

    await expect(api.join.preview('NOPE')).rejects.toThrow()
  })
})

describe('api.searches.getById', () => {
  it('maps join_token onto the search detail', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: remoteSearch }),
    })

    const result = await api.searches.getById('search-1')

    expect(result.joinToken).toBe('ABCDE12345')
  })
})

describe('api.searches.rotateJoinToken', () => {
  it('POSTs to the rotate endpoint and returns the new token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { join_token: 'NEWTOKEN99' } }),
    })

    const token = await api.searches.rotateJoinToken('search-1')

    expect(token).toBe('NEWTOKEN99')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/join_token/rotate')
    expect(init.method).toBe('POST')
  })
})

describe('api.volunteers.listBySearch', () => {
  it('maps remote snake_case volunteers to the UI shape', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: 'vol-1',
              name: 'Giulia Bianchi',
              phone: '+390698765',
              resource_type: 'people',
              status: 'pending',
              last_active_at: null,
              joined_at: '2026-08-01T10:00:00Z',
              approved_at: null,
              removed_at: null,
              zones_searched: 0,
            },
          ],
        }),
    })

    const result = await api.volunteers.listBySearch('search-1')

    expect(result).toEqual([
      {
        id: 'vol-1',
        name: 'Giulia Bianchi',
        phone: '+390698765',
        resourceType: 'people',
        status: 'pending',
        lastActiveAt: null,
        joinedAt: '2026-08-01T10:00:00Z',
        approvedAt: null,
        removedAt: null,
        zonesSearched: 0,
      },
    ])
  })
})

describe('api.volunteers.setStatus', () => {
  it('PATCHes the status and returns the updated volunteer', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            id: 'vol-1',
            name: 'Giulia Bianchi',
            phone: '+390698765',
            resource_type: 'people',
            status: 'approved',
            last_active_at: null,
            joined_at: '2026-08-01T10:00:00Z',
            approved_at: '2026-08-01T10:05:00Z',
            removed_at: null,
            zones_searched: 0,
          },
        }),
    })

    const result = await api.volunteers.setStatus('search-1', 'vol-1', 'approved')

    expect(result.status).toBe('approved')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/volunteers/vol-1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ status: 'approved' })
  })
})
