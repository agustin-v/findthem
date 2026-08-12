import { usePhotoUploadStore } from './usePhotoUploadStore'

const { getState } = usePhotoUploadStore

beforeEach(() => {
  usePhotoUploadStore.setState({ failuresBySearch: {} })
})

describe('usePhotoUploadStore', () => {
  it('setFailures records the failure count by searchId', () => {
    getState().setFailures('search-1', 2, 5)

    expect(getState().failuresBySearch['search-1']).toEqual({ failed: 2, total: 5 })
  })

  it('multiple searchIds coexist', () => {
    getState().setFailures('search-1', 1, 3)
    getState().setFailures('search-2', 4, 4)

    expect(getState().failuresBySearch['search-1']).toEqual({ failed: 1, total: 3 })
    expect(getState().failuresBySearch['search-2']).toEqual({ failed: 4, total: 4 })
  })

  it('clear removes the failure for one searchId without touching others', () => {
    getState().setFailures('search-1', 1, 3)
    getState().setFailures('search-2', 2, 2)

    getState().clear('search-1')

    expect(getState().failuresBySearch['search-1']).toBeUndefined()
    expect(getState().failuresBySearch['search-2']).toEqual({ failed: 2, total: 2 })
  })

  it('setFailures overwrites a previous entry for the same searchId', () => {
    getState().setFailures('search-1', 1, 3)
    getState().setFailures('search-1', 2, 3)

    expect(getState().failuresBySearch['search-1']).toEqual({ failed: 2, total: 3 })
  })
})
