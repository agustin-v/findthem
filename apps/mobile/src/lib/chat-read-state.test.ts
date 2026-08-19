import { getLastReadAt, markReadUpTo, resetChatReadState } from './chat-read-state'

const mockRead = vi.fn()
const mockWrite = vi.fn()
vi.mock('@/lib/chat-read-storage', () => ({
  readLastReadAt: (...args: unknown[]) => mockRead(...args),
  writeLastReadAt: (...args: unknown[]) => mockWrite(...args),
}))

describe('chat-read-state', () => {
  beforeEach(() => {
    mockRead.mockReset().mockResolvedValue(null)
    mockWrite.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    resetChatReadState()
  })

  it('starts with no read marker', () => {
    expect(getLastReadAt()).toBeNull()
  })

  it('markReadUpTo sets the marker and persists it', () => {
    markReadUpTo('2026-08-01T09:32:00Z')
    expect(getLastReadAt()).toBe('2026-08-01T09:32:00Z')
    expect(mockWrite).toHaveBeenCalledWith('2026-08-01T09:32:00Z')
  })

  it('markReadUpTo only advances, never moves backwards', () => {
    markReadUpTo('2026-08-01T09:32:00Z')
    markReadUpTo('2026-08-01T09:00:00Z')
    expect(getLastReadAt()).toBe('2026-08-01T09:32:00Z')
  })

  it('markReadUpTo advances when given a later timestamp', () => {
    markReadUpTo('2026-08-01T09:00:00Z')
    markReadUpTo('2026-08-01T09:32:00Z')
    expect(getLastReadAt()).toBe('2026-08-01T09:32:00Z')
  })

  it('resetChatReadState clears the marker and persists the clear', () => {
    markReadUpTo('2026-08-01T09:32:00Z')
    resetChatReadState()
    expect(getLastReadAt()).toBeNull()
    expect(mockWrite).toHaveBeenLastCalledWith(null)
  })
})

// Hydration transitions depend on the module's internal "have we hydrated
// yet" flag, which resetChatReadState() deliberately leaves `true` (once
// reset, the real answer is already known to be null — no need to re-read
// storage). That makes the shared module instance in the block above
// unsuitable for testing the from-scratch hydration path, so each test
// here starts from a completely fresh module instance instead.
describe('chat-read-state hydration', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockWrite.mockReset().mockResolvedValue(undefined)
    vi.resetModules()
  })

  it('loads a persisted marker exactly once', async () => {
    mockRead.mockResolvedValue('2026-08-01T09:32:00Z')
    const fresh = await import('./chat-read-state')

    await fresh.hydrateChatReadState()
    expect(fresh.getLastReadAt()).toBe('2026-08-01T09:32:00Z')

    await fresh.hydrateChatReadState()
    expect(mockRead).toHaveBeenCalledTimes(1)
  })

  it('leaves the marker null when nothing is persisted', async () => {
    mockRead.mockResolvedValue(null)
    const fresh = await import('./chat-read-state')

    await fresh.hydrateChatReadState()

    expect(fresh.getLastReadAt()).toBeNull()
  })

  it('does not clobber a marker already set this session', async () => {
    mockRead.mockResolvedValue('2026-08-01T05:00:00Z')
    const fresh = await import('./chat-read-state')

    fresh.markReadUpTo('2026-08-01T09:00:00Z')
    await fresh.hydrateChatReadState()

    expect(fresh.getLastReadAt()).toBe('2026-08-01T09:00:00Z')
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('a failed hydration read leaves the marker null instead of throwing', async () => {
    mockRead.mockRejectedValue(new Error('secure store unavailable'))
    const fresh = await import('./chat-read-state')

    await expect(fresh.hydrateChatReadState()).resolves.toBeUndefined()

    expect(fresh.getLastReadAt()).toBeNull()
  })
})
