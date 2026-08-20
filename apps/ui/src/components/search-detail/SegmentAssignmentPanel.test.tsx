import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SegmentAssignmentPanel } from './SegmentAssignmentPanel'
import type { SegmentStatusEntry, Volunteer } from '@/lib/api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

const mockAssign = vi.fn()
const mockUnassign = vi.fn()
const mockLock = vi.fn()
const mockUnlock = vi.fn()
let mockLockIsError = false
let mockUnlockIsError = false

vi.mock('@/hooks/useSearches', () => ({
  useAssignVolunteer: () => ({ mutate: mockAssign, isPending: false, isError: false }),
  useUnassignVolunteer: () => ({ mutate: mockUnassign, isPending: false, isError: false }),
  useLockSegment: () => ({ mutate: mockLock, isPending: false, isError: mockLockIsError }),
  useUnlockSegment: () => ({ mutate: mockUnlock, isPending: false, isError: mockUnlockIsError }),
}))

function volunteer(overrides: Partial<Volunteer> = {}): Volunteer {
  return {
    id: 'vol-1',
    name: 'Giulia',
    phone: '+390698765',
    resourceType: null,
    status: 'approved',
    consentLocation: false,
    lastLocation: null,
    lastActiveAt: null,
    joinedAt: '2026-08-20T00:00:00Z',
    approvedAt: '2026-08-20T00:00:00Z',
    removedAt: null,
    segmentsSearched: 0,
    ...overrides,
  }
}

function unlockedSegment(overrides: Partial<SegmentStatusEntry> = {}): SegmentStatusEntry {
  return {
    segmentId: 3,
    status: 'in_progress',
    searchedAt: null,
    searchedByVolunteerId: null,
    lockedAt: null,
    lockedByUserId: null,
    lockedForVolunteerId: null,
    lockReason: null,
    ...overrides,
  }
}

describe('SegmentAssignmentPanel — locking', () => {
  beforeEach(() => {
    mockAssign.mockReset()
    mockUnassign.mockReset()
    mockLock.mockReset()
    mockUnlock.mockReset()
    mockLockIsError = false
    mockUnlockIsError = false
  })

  it('pre-fills the lock volunteer picker from searched_by_volunteer_id and locks on click', async () => {
    const user = userEvent.setup()
    const giulia = volunteer({ id: 'vol-1', name: 'Giulia' })

    render(
      <SegmentAssignmentPanel
        searchId="search-1"
        segmentId={3}
        volunteers={[giulia]}
        assignments={[]}
        segmentStatus={unlockedSegment({ searchedByVolunteerId: 'vol-1' })}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByText('detail.assignment.lock.lockButton'))

    expect(mockLock).toHaveBeenCalledWith(
      { segmentId: 3, lockedForVolunteerId: 'vol-1', lockReason: undefined },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('does not pre-fill when searched_by_volunteer_id does not belong to an approved volunteer of this search', () => {
    const giulia = volunteer({ id: 'vol-1', name: 'Giulia' })

    render(
      <SegmentAssignmentPanel
        searchId="search-1"
        segmentId={3}
        volunteers={[giulia]}
        assignments={[]}
        segmentStatus={unlockedSegment({ searchedByVolunteerId: 'someone-else' })}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('detail.assignment.lock.lockButton')).toBeDisabled()
  })

  it('shows locked-for state and clears the lock on unlock click', async () => {
    const user = userEvent.setup()
    const giulia = volunteer({ id: 'vol-1', name: 'Giulia' })

    render(
      <SegmentAssignmentPanel
        searchId="search-1"
        segmentId={3}
        volunteers={[giulia]}
        assignments={[]}
        segmentStatus={unlockedSegment({
          lockedAt: '2026-08-20T10:00:00Z',
          lockedByUserId: 'user-1',
          lockedForVolunteerId: 'vol-1',
          lockReason: 'went offline mid-sweep',
        })}
        onClose={vi.fn()}
      />,
    )

    expect(
      screen.getByText('detail.assignment.lock.lockedFor:{"name":"Giulia"}'),
    ).toBeInTheDocument()
    expect(screen.getByText('went offline mid-sweep')).toBeInTheDocument()

    await user.click(screen.getByText('detail.assignment.lock.unlockButton'))

    expect(mockUnlock).toHaveBeenCalledWith(3)
  })

  it('shows a generic locked label when the reserved volunteer is not in the roster', () => {
    render(
      <SegmentAssignmentPanel
        searchId="search-1"
        segmentId={3}
        volunteers={[]}
        assignments={[]}
        segmentStatus={unlockedSegment({
          lockedAt: '2026-08-20T10:00:00Z',
          lockedForVolunteerId: 'vol-1',
        })}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('detail.assignment.lock.lockedGeneric')).toBeInTheDocument()
    expect(screen.getByText('detail.assignment.lock.reasonNone')).toBeInTheDocument()
  })

  it('shows the lock action-failed message when the lock mutation errors', () => {
    mockLockIsError = true
    const giulia = volunteer({ id: 'vol-1', name: 'Giulia' })

    render(
      <SegmentAssignmentPanel
        searchId="search-1"
        segmentId={3}
        volunteers={[giulia]}
        assignments={[]}
        segmentStatus={unlockedSegment({ searchedByVolunteerId: 'vol-1' })}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('detail.assignment.lock.actionFailed')).toBeInTheDocument()
  })
})
