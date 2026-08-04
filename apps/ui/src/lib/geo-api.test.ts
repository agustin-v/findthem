import { generateSegments, checkHealth, GeoApiError, extractZoneCells } from './geo-api'
import { mockSegmentsResponse } from '@/test/mocks'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

afterEach(() => {
  mockFetch.mockReset()
})

describe('generateSegments', () => {
  const request = {
    center: { lat: 41.9028, lng: 12.4964 },
    radius_km: 1.5,
    resources: [{ type: 'people', count: 8 }],
  }

  it('sends correct POST body and parses response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSegmentsResponse),
    })

    const result = await generateSegments(request)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/v1/segments/generate')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(request)
    expect(result.segments.features).toHaveLength(2)
    expect(result.meta.total_segments).toBe(2)
  })

  it('throws GeoApiError on 422', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve('Validation error'),
      statusText: 'Unprocessable Entity',
    })

    await expect(generateSegments(request)).rejects.toThrow(GeoApiError)
    await expect(generateSegments(request)).rejects.toThrow()

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve('Validation error'),
      statusText: 'Unprocessable Entity',
    })
    try {
      await generateSegments(request)
    } catch (e) {
      expect(e).toBeInstanceOf(GeoApiError)
      expect((e as GeoApiError).status).toBe(422)
    }
  })

  it('throws GeoApiError on 503', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: () => Promise.resolve('OSM timeout'),
      statusText: 'Service Unavailable',
    })

    try {
      await generateSegments(request)
    } catch (e) {
      expect(e).toBeInstanceOf(GeoApiError)
      expect((e as GeoApiError).status).toBe(503)
    }
  })

  it('throws GeoApiError on 500', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal server error'),
      statusText: 'Internal Server Error',
    })

    try {
      await generateSegments(request)
    } catch (e) {
      expect(e).toBeInstanceOf(GeoApiError)
      expect((e as GeoApiError).status).toBe(500)
    }
  })

  it('passes abort signal', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSegmentsResponse),
    })

    const controller = new AbortController()
    await generateSegments(request, controller.signal)
    expect(mockFetch.mock.calls[0][1].signal).toBe(controller.signal)
  })
})

describe('checkHealth', () => {
  it('returns true on {"status":"ok"}', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    })

    expect(await checkHealth()).toBe(true)
  })

  it('returns false on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
    })

    expect(await checkHealth()).toBe(false)
  })

  it('returns false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    expect(await checkHealth()).toBe(false)
  })
})

describe('extractZoneCells', () => {
  it('flattens each segment\'s cells into (h3Index, segmentId) pairs', () => {
    const cells = extractZoneCells(mockSegmentsResponse.segments)

    expect(cells).toEqual([
      { h3Index: '891f1d48177ffff', segmentId: 0 },
      { h3Index: '891f1d48178ffff', segmentId: 0 },
      { h3Index: '891f1d4816bffff', segmentId: 1 },
    ])
  })

  it('skips features with no cells property', () => {
    const geojson = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { segment_id: 0 },
          geometry: { type: 'Polygon' as const, coordinates: [] },
        },
      ],
    }

    expect(extractZoneCells(geojson)).toEqual([])
  })
})
