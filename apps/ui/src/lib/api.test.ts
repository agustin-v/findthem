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
  photo_urls: ['https://signed.example.com/searches/search-1/a.jpg'],
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
    expect(result.photoUrls).toEqual(['https://signed.example.com/searches/search-1/a.jpg'])
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
              consent_location: true,
              last_location: { lat: 41.9, lng: 12.5, recorded_at: '2026-08-20T10:00:00Z' },
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
        consentLocation: true,
        lastLocation: { lat: 41.9, lng: 12.5, recordedAt: '2026-08-20T10:00:00Z' },
        lastActiveAt: null,
        joinedAt: '2026-08-01T10:00:00Z',
        approvedAt: null,
        removedAt: null,
        segmentsSearched: 0,
      },
    ])
  })

  it('maps a null last_location to null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: 'vol-2',
              name: 'Luca Verdi',
              phone: '+390698766',
              resource_type: null,
              status: 'approved',
              consent_location: false,
              last_location: null,
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

    expect(result[0].consentLocation).toBe(false)
    expect(result[0].lastLocation).toBeNull()
  })
})

describe('api.volunteers.getTrail', () => {
  it('maps the volunteer breadcrumb trail', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            { id: 'loc-1', lat: 41.9, lng: 12.5, recorded_at: '2026-08-20T10:00:00Z' },
            { id: 'loc-2', lat: 41.91, lng: 12.51, recorded_at: '2026-08-20T10:01:00Z' },
          ],
        }),
    })

    const result = await api.volunteers.getTrail('search-1', 'vol-1')

    expect(result).toEqual([
      { lat: 41.9, lng: 12.5, recordedAt: '2026-08-20T10:00:00Z' },
      { lat: 41.91, lng: 12.51, recordedAt: '2026-08-20T10:01:00Z' },
    ])
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/volunteers/vol-1/locations')
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
            consent_location: false,
            last_location: null,
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
            {
              segment_id: 1,
              status: 'in_progress',
              searched_at: null,
              searched_by_volunteer_id: 'vol-1',
              locked_at: '2026-08-20T10:00:00Z',
              locked_by_user_id: 'user-1',
              locked_for_volunteer_id: 'vol-1',
              lock_reason: 'went offline mid-sweep',
            },
          ],
        }),
    })

    const result = await api.segments.getBySearch('search-1')

    expect(result).toEqual([
      {
        segmentId: 0,
        status: 'not_assigned',
        searchedAt: null,
        searchedByVolunteerId: undefined,
        lockedAt: undefined,
        lockedByUserId: undefined,
        lockedForVolunteerId: undefined,
        lockReason: undefined,
      },
      {
        segmentId: 1,
        status: 'in_progress',
        searchedAt: null,
        searchedByVolunteerId: 'vol-1',
        lockedAt: '2026-08-20T10:00:00Z',
        lockedByUserId: 'user-1',
        lockedForVolunteerId: 'vol-1',
        lockReason: 'went offline mid-sweep',
      },
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

    expect(result).toMatchObject({ segmentId: 3, status: 'searched', searchedAt: '2026-08-05T10:00:00Z' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/segments/3')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ status: 'searched' })
  })
})

describe('api.segments.lock', () => {
  it('POSTs the reserved volunteer + reason and maps the response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            segment_id: 3,
            status: 'in_progress',
            searched_at: null,
            locked_at: '2026-08-20T10:00:00Z',
            locked_by_user_id: 'user-1',
            locked_for_volunteer_id: 'vol-1',
            lock_reason: 'went offline mid-sweep',
          },
        }),
    })

    const result = await api.segments.lock('search-1', 3, {
      lockedForVolunteerId: 'vol-1',
      lockReason: 'went offline mid-sweep',
    })

    expect(result.lockedForVolunteerId).toBe('vol-1')
    expect(result.lockReason).toBe('went offline mid-sweep')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/segments/3/lock')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      locked_for_volunteer_id: 'vol-1',
      lock_reason: 'went offline mid-sweep',
    })
  })
})

describe('api.segments.unlock', () => {
  it('POSTs to the unlock endpoint and maps the response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: { segment_id: 3, status: 'in_progress', searched_at: null, locked_at: null },
        }),
    })

    const result = await api.segments.unlock('search-1', 3)

    expect(result.lockedAt).toBe(null)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/segments/3/unlock')
    expect(init.method).toBe('POST')
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

describe('api.photos.upload', () => {
  it('POSTs the file as multipart form data under the "photo" field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ data: remoteSearch }),
    })

    const file = new File(['fake-image-bytes'], 'fixture.jpg', { type: 'image/jpeg' })
    const result = await api.photos.upload('search-1', file)

    expect(result.photoUrls).toEqual(remoteSearch.photo_urls)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/photos')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect(init.body.get('photo')).toBe(file)
    // Must NOT set a JSON content-type — that would break the browser's
    // own multipart boundary header.
    expect(init.headers['Content-Type']).toBeUndefined()
  })
})

describe('api.messages.listBySearch', () => {
  it('maps remote snake_case messages to the UI shape', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: 'msg-1',
              search_id: 'search-1',
              volunteer_id: 'vol-1',
              sender: 'coordinator',
              text: 'Check the north fence line',
              inserted_at: '2026-08-01T10:00:00Z',
            },
          ],
        }),
    })

    const result = await api.messages.listBySearch('search-1')

    expect(result).toEqual([
      {
        id: 'msg-1',
        searchId: 'search-1',
        volunteerId: 'vol-1',
        sender: 'coordinator',
        text: 'Check the north fence line',
        insertedAt: '2026-08-01T10:00:00Z',
      },
    ])
  })
})

describe('api.messages.send', () => {
  it('POSTs a client-generated id, the volunteer_id, and text — never a sender', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          data: {
            id: 'msg-1',
            search_id: 'search-1',
            volunteer_id: 'vol-1',
            sender: 'coordinator',
            text: 'On my way',
            inserted_at: '2026-08-01T10:00:00Z',
          },
        }),
    })

    const result = await api.messages.send('search-1', 'vol-1', 'On my way')

    expect(result.sender).toBe('coordinator')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/messages')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.message.volunteer_id).toBe('vol-1')
    expect(body.message.text).toBe('On my way')
    expect(typeof body.message.id).toBe('string')
    expect(body.message.id.length).toBeGreaterThan(0)
    // sender is never sent from the client — the backend forces it from
    // the authenticated identity (see MessageController.create).
    expect(body.message.sender).toBeUndefined()
  })

  it('generates a distinct id per call', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          data: {
            id: 'msg-1',
            search_id: 'search-1',
            volunteer_id: 'vol-1',
            sender: 'coordinator',
            text: 'hi',
            inserted_at: '2026-08-01T10:00:00Z',
          },
        }),
    })

    await api.messages.send('search-1', 'vol-1', 'first')
    await api.messages.send('search-1', 'vol-1', 'second')

    // Regression: a memoized/reused id here would rely on the backend's
    // on_conflict: :nothing idempotency to silently discard every message
    // after the first, rather than actually sending each one.
    const id1 = JSON.parse(mockFetch.mock.calls[0][1].body).message.id
    const id2 = JSON.parse(mockFetch.mock.calls[1][1].body).message.id
    expect(id1).not.toBe(id2)
  })
})

describe('api.remarks.listBySearch', () => {
  it('maps remote snake_case remarks to the UI shape', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: 'remark-1',
              search_id: 'search-1',
              volunteer_id: null,
              kind: 'hazard',
              text: 'Bridge is down',
              lat: 41.9,
              lng: 12.5,
              reported_at: '2026-08-19T10:00:00Z',
              inserted_at: '2026-08-19T10:00:00Z',
            },
          ],
        }),
    })

    const result = await api.remarks.listBySearch('search-1')

    expect(result).toEqual([
      {
        id: 'remark-1',
        searchId: 'search-1',
        volunteerId: null,
        kind: 'hazard',
        text: 'Bridge is down',
        lat: 41.9,
        lng: 12.5,
        reportedAt: '2026-08-19T10:00:00Z',
        insertedAt: '2026-08-19T10:00:00Z',
      },
    ])
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/remarks')
  })
})

describe('api.remarks.create', () => {
  it('POSTs a client-generated id and the required lat/lng', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          data: {
            id: 'remark-2',
            search_id: 'search-1',
            volunteer_id: null,
            kind: 'hazard',
            text: 'Bridge is down',
            lat: 41.9,
            lng: 12.5,
            reported_at: '2026-08-19T10:00:00Z',
            inserted_at: '2026-08-19T10:00:00Z',
          },
        }),
    })

    const result = await api.remarks.create('search-1', {
      kind: 'hazard',
      text: 'Bridge is down',
      lat: 41.9,
      lng: 12.5,
    })

    expect(result.kind).toBe('hazard')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/searches/search-1/remarks')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.remark.kind).toBe('hazard')
    expect(body.remark.text).toBe('Bridge is down')
    expect(body.remark.lat).toBe(41.9)
    expect(body.remark.lng).toBe(12.5)
    expect(typeof body.remark.id).toBe('string')
    expect(body.remark.id.length).toBeGreaterThan(0)
    expect(typeof body.remark.reported_at).toBe('string')
  })
})
