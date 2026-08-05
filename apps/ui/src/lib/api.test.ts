import { api } from './api'
import { mockSegmentsResponse } from '@/test/mocks'

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
  segments_searched: 3,
  total_segments: 10,
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
              segments_searched: 0,
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
        segmentsSearched: 0,
      },
    ])
  })
})

describe('api.searches.generate', () => {
  it('POSTs radius/h3/resources and returns the generation response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          data: {
            id: 'gen-1',
            meta: mockSegmentsResponse.meta,
            response: mockSegmentsResponse,
            inserted_at: '2026-08-04T10:00:00Z',
          },
        }),
    })

    const result = await api.searches.generate('search-1', {
      radiusKm: 1.5,
      resources: [{ type: 'people', count: 4 }],
    })

    expect(result).toEqual(mockSegmentsResponse)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/generate')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      radius_km: 1.5,
      resources: [{ type: 'people', count: 4 }],
    })
  })
})

describe('api.searches.getLatestGeneration', () => {
  it('returns the response payload when a generation exists', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            id: 'gen-1',
            meta: mockSegmentsResponse.meta,
            response: mockSegmentsResponse,
            inserted_at: '2026-08-04T10:00:00Z',
          },
        }),
    })

    const result = await api.searches.getLatestGeneration('search-1')

    expect(result).toEqual(mockSegmentsResponse)
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/generations/latest')
  })

  it('returns null when no generation exists yet', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: null }),
    })

    const result = await api.searches.getLatestGeneration('search-1')

    expect(result).toBeNull()
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
            segments_searched: 0,
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

describe('api.segments.getBySearch', () => {
  it('maps remote snake_case segment status rows to the UI shape', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            { segment_id: 0, status: 'not_assigned', searched_at: null },
            { segment_id: 1, status: 'searched', searched_at: '2026-08-05T10:00:00Z' },
          ],
        }),
    })

    const result = await api.segments.getBySearch('search-1')

    expect(result).toEqual([
      { segmentId: 0, status: 'not_assigned', searchedAt: null },
      { segmentId: 1, status: 'searched', searchedAt: '2026-08-05T10:00:00Z' },
    ])
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/segments')
  })
})

describe('api.segments.updateStatus', () => {
  it('PATCHes the segment status and maps the response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: { segment_id: 3, status: 'searched', searched_at: '2026-08-05T10:00:00Z' },
        }),
    })

    const result = await api.segments.updateStatus('search-1', 3, 'searched')

    expect(result).toEqual({ segmentId: 3, status: 'searched', searchedAt: '2026-08-05T10:00:00Z' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/segments/3')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ status: 'searched' })
  })
})

describe('api.segmentAssignments.getBySearch', () => {
  it('maps remote snake_case assignment rows to the UI shape', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            { segment_id: 0, volunteer_id: 'vol-1', assigned_at: '2026-08-05T10:00:00Z' },
          ],
        }),
    })

    const result = await api.segmentAssignments.getBySearch('search-1')

    expect(result).toEqual([
      { segmentId: 0, volunteerId: 'vol-1', assignedAt: '2026-08-05T10:00:00Z' },
    ])
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/segment_assignments')
  })
})

describe('api.segmentAssignments.assign', () => {
  it('POSTs segment_id/volunteer_id and maps the response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          data: { segment_id: 0, volunteer_id: 'vol-1', assigned_at: '2026-08-05T10:00:00Z' },
        }),
    })

    const result = await api.segmentAssignments.assign('search-1', 0, 'vol-1')

    expect(result).toEqual({ segmentId: 0, volunteerId: 'vol-1', assignedAt: '2026-08-05T10:00:00Z' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/segment_assignments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ segment_id: 0, volunteer_id: 'vol-1' })
  })
})

describe('api.segmentAssignments.unassign', () => {
  it('DELETEs the assignment', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    await api.segmentAssignments.unassign('search-1', 0, 'vol-1')

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/segment_assignments/0/vol-1')
    expect(init.method).toBe('DELETE')
  })
})
