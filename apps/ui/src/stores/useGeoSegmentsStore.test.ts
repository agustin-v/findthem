import { useGeoSegmentsStore } from './useGeoSegmentsStore'
import { mockSegmentsResponse } from '@/test/mocks'

const { getState } = useGeoSegmentsStore

beforeEach(() => {
  // Reset store to initial state
  useGeoSegmentsStore.setState({
    segmentsBySearch: {},
    restrictedAreasBySearch: {},
    metaBySearch: {},
    loading: false,
    error: null,
  })
})

describe('useGeoSegmentsStore', () => {
  it('setResponse stores data by searchId', () => {
    getState().setResponse('search-1', mockSegmentsResponse)

    expect(getState().segmentsBySearch['search-1']).toBe(mockSegmentsResponse.segments)
    expect(getState().restrictedAreasBySearch['search-1']).toBe(mockSegmentsResponse.restricted_areas)
    expect(getState().metaBySearch['search-1']).toBe(mockSegmentsResponse.meta)
  })

  it('multiple searchIds coexist', () => {
    getState().setResponse('search-1', mockSegmentsResponse)
    getState().setResponse('search-2', mockSegmentsResponse)

    expect(getState().segmentsBySearch['search-1']).toBeDefined()
    expect(getState().segmentsBySearch['search-2']).toBeDefined()
  })

  it('setResponse clears loading and error', () => {
    getState().setLoading(true)
    getState().setError('something broke')
    getState().setResponse('search-1', mockSegmentsResponse)

    expect(getState().loading).toBe(false)
    expect(getState().error).toBeNull()
  })

  it('clear removes data for one searchId', () => {
    getState().setResponse('search-1', mockSegmentsResponse)
    getState().setResponse('search-2', mockSegmentsResponse)

    getState().clear('search-1')

    expect(getState().segmentsBySearch['search-1']).toBeUndefined()
    expect(getState().segmentsBySearch['search-2']).toBeDefined()
  })

  it('setLoading updates loading state', () => {
    getState().setLoading(true)
    expect(getState().loading).toBe(true)
    expect(getState().error).toBeNull()
  })

  it('setError sets error and clears loading', () => {
    getState().setLoading(true)
    getState().setError('OSM timeout')

    expect(getState().error).toBe('OSM timeout')
    expect(getState().loading).toBe(false)
  })

  it('setError with null clears the error', () => {
    getState().setError('something')
    getState().setError(null)
    expect(getState().error).toBeNull()
  })
})
