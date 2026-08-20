import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSearchChannel } from './useSearchChannel'

const handlers = new Map<string, (payload?: unknown) => void>()
const mockJoinReceive = vi.fn().mockReturnThis()
const mockJoin = vi.fn(() => ({ receive: mockJoinReceive }))
const mockLeave = vi.fn()
const mockChannel = {
  on: vi.fn((event: string, cb: (payload?: unknown) => void) => {
    handlers.set(event, cb)
  }),
  join: mockJoin,
  leave: mockLeave,
}
const mockSocket = { channel: vi.fn(() => mockChannel) }

vi.mock('@/lib/socket', () => ({
  getSocket: vi.fn(() => Promise.resolve(mockSocket)),
}))

const mockSetGeoResponse = vi.fn()
vi.mock('@/stores/useGeoSegmentsStore', () => ({
  useGeoSegmentsStore: (selector: (s: { setResponse: typeof mockSetGeoResponse }) => unknown) =>
    selector({ setResponse: mockSetGeoResponse }),
}))

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useSearchChannel', () => {
  beforeEach(() => {
    handlers.clear()
    mockChannel.on.mockClear()
    mockJoin.mockClear()
    mockLeave.mockClear()
    mockSocket.channel.mockClear()
    mockSetGeoResponse.mockClear()
  })

  it('joins the search:<id> topic', async () => {
    const queryClient = new QueryClient()
    renderHook(() => useSearchChannel('search-1'), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(mockSocket.channel).toHaveBeenCalledWith('search:search-1', {}))
    expect(mockJoin).toHaveBeenCalled()
  })

  it('invalidates the messages query when a message_created event arrives', async () => {
    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useSearchChannel('search-1'), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(handlers.has('message_created')).toBe(true))
    handlers.get('message_created')?.()

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['messages', 'search-1'] })
  })

  it('invalidates the volunteers query when a location_updated event arrives', async () => {
    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useSearchChannel('search-1'), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(handlers.has('location_updated')).toBe(true))
    handlers.get('location_updated')?.()

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['volunteers', 'search-1'] })
  })

  // Regression: a coordinator watching a volunteer's breadcrumb trail
  // needs it kept fresh — without this, the trail line would silently
  // stop growing while the volunteer's live dot kept moving.
  it('also invalidates the volunteer-trail query when a location_updated event arrives', async () => {
    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useSearchChannel('search-1'), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(handlers.has('location_updated')).toBe(true))
    handlers.get('location_updated')?.()

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['volunteer-trail', 'search-1'] })
  })

  // Regression: a trail left open for a volunteer who's then removed (or,
  // should a future story add it, loses location consent) must stop
  // showing stale data rather than only refreshing on the next ping.
  it('also invalidates the volunteer-trail query when a volunteer_updated event arrives', async () => {
    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useSearchChannel('search-1'), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(handlers.has('volunteer_updated')).toBe(true))
    handlers.get('volunteer_updated')?.()

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['volunteers', 'search-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['volunteer-trail', 'search-1'] })
  })

  it('does not register a handler for an unrelated search id after unmount', async () => {
    const queryClient = new QueryClient()
    const { unmount } = renderHook(() => useSearchChannel('search-1'), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(handlers.has('message_created')).toBe(true))
    unmount()

    expect(mockLeave).toHaveBeenCalled()
  })
})
