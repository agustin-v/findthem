import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VolunteerTable } from './VolunteerTable'
import type { SegmentAssignment, Volunteer } from '@/lib/api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${JSON.stringify(opts)}` : key,
    i18n: { language: 'en' },
  }),
}))

const mockMutate = vi.fn()
let mockIsError = false
vi.mock('@/hooks/useSearches', () => ({
  useSetVolunteerStatus: () => ({ mutate: mockMutate, isPending: false, isError: mockIsError }),
}))

function pendingVolunteer(overrides: Partial<Volunteer> = {}): Volunteer {
  return {
    id: 'vol-pending',
    name: 'Giulia Bianchi',
    phone: '+390698765',
    resourceType: 'people',
    status: 'pending',
    lastActiveAt: null,
    joinedAt: '2026-08-01T10:00:00Z',
    approvedAt: null,
    removedAt: null,
    segmentsSearched: 0,
    ...overrides,
  }
}

function approvedVolunteer(overrides: Partial<Volunteer> = {}): Volunteer {
  return {
    id: 'vol-approved',
    name: 'Luca Moretti',
    phone: '+390698766',
    resourceType: 'cars',
    status: 'approved',
    lastActiveAt: null,
    joinedAt: '2026-08-01T09:00:00Z',
    approvedAt: '2026-08-01T09:05:00Z',
    removedAt: null,
    segmentsSearched: 2,
    ...overrides,
  }
}

function renderTable(overrides: {
  volunteers?: Volunteer[]
  isError?: boolean
  assignments?: SegmentAssignment[]
  onMessage?: (id: string) => void
} = {}) {
  const onMessage = overrides.onMessage ?? vi.fn()
  render(
    <VolunteerTable
      searchId="search-1"
      volunteers={overrides.volunteers ?? []}
      isError={overrides.isError}
      assignments={overrides.assignments ?? []}
      onMessage={onMessage}
    />,
  )
  return { onMessage }
}

describe('VolunteerTable', () => {
  beforeEach(() => {
    mockMutate.mockReset()
    mockIsError = false
  })

  it('defaults to the pending tab when there are pending volunteers', () => {
    renderTable({ volunteers: [pendingVolunteer()] })
    expect(screen.getByText('Giulia Bianchi')).toBeInTheDocument()
  })

  it('approving a pending volunteer calls setStatus with approved', async () => {
    const user = userEvent.setup()
    renderTable({ volunteers: [pendingVolunteer()] })

    await user.click(screen.getByText('detail.approve'))

    expect(mockMutate).toHaveBeenCalledWith({ volunteerId: 'vol-pending', status: 'approved' })
  })

  it('denying a pending volunteer calls setStatus with removed', async () => {
    const user = userEvent.setup()
    renderTable({ volunteers: [pendingVolunteer()] })

    await user.click(screen.getByLabelText('detail.deny'))

    expect(mockMutate).toHaveBeenCalledWith({ volunteerId: 'vol-pending', status: 'removed' })
  })

  it('shows approved volunteers under the active tab with mode, status, and assigned zone', async () => {
    const user = userEvent.setup()
    renderTable({
      volunteers: [approvedVolunteer()],
      assignments: [{ segmentId: 4, volunteerId: 'vol-approved', assignedAt: '2026-08-01T09:00:00Z' }],
    })

    await user.click(screen.getByText(/detail.volunteersActive/))

    expect(screen.getByText('Luca Moretti')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('detail.offline')).toBeInTheDocument()
  })

  it('shows a dash for assigned zone when the volunteer has no assignment', async () => {
    const user = userEvent.setup()
    renderTable({ volunteers: [approvedVolunteer()] })

    await user.click(screen.getByText(/detail.volunteersActive/))

    const row = screen.getByText('Luca Moretti').closest('tr')!
    expect(within(row).getByText('—')).toBeInTheDocument()
  })

  it('shows Live status for a recently active volunteer', async () => {
    const user = userEvent.setup()
    renderTable({ volunteers: [approvedVolunteer({ lastActiveAt: new Date().toISOString() })] })

    await user.click(screen.getByText(/detail.volunteersActive/))

    expect(screen.getByText('detail.online')).toBeInTheDocument()
  })

  it('filters approved volunteers by name', async () => {
    const user = userEvent.setup()
    renderTable({
      volunteers: [approvedVolunteer(), approvedVolunteer({ id: 'vol-2', name: 'Andrea Neri' })],
    })
    await user.click(screen.getByText(/detail.volunteersActive/))

    await user.type(screen.getByPlaceholderText('detail.table.searchPlaceholder'), 'andrea')

    expect(screen.getByText('Andrea Neri')).toBeInTheDocument()
    expect(screen.queryByText('Luca Moretti')).not.toBeInTheDocument()
  })

  it('opening the row menu and clicking Message calls onMessage', async () => {
    const user = userEvent.setup()
    const { onMessage } = renderTable({ volunteers: [approvedVolunteer()] })
    await user.click(screen.getByText(/detail.volunteersActive/))

    await user.click(screen.getByLabelText(/detail.table.rowActions/))
    await user.click(screen.getByText('detail.table.message'))

    expect(onMessage).toHaveBeenCalledWith('vol-approved')
  })

  it('opening the row menu and clicking Remove calls setStatus with removed', async () => {
    const user = userEvent.setup()
    renderTable({ volunteers: [approvedVolunteer()] })
    await user.click(screen.getByText(/detail.volunteersActive/))

    await user.click(screen.getByLabelText(/detail.table.rowActions/))
    await user.click(screen.getByText('detail.remove'))

    expect(mockMutate).toHaveBeenCalledWith({ volunteerId: 'vol-approved', status: 'removed' })
  })

  it('shows a load-error message instead of the tabs when the list failed to fetch', () => {
    renderTable({ isError: true })

    expect(screen.getByText('detail.volunteersLoadError')).toBeInTheDocument()
    expect(screen.queryByText(/detail.volunteersActive/)).not.toBeInTheDocument()
  })

  it('shows an action-failed message when a mutation errors', () => {
    mockIsError = true
    renderTable({ volunteers: [pendingVolunteer()] })

    expect(screen.getByText('detail.actionFailed')).toBeInTheDocument()
  })

  it('switches away from the pending tab once the last pending request is resolved', () => {
    const { rerender } = render(
      <VolunteerTable
        searchId="search-1"
        volunteers={[pendingVolunteer()]}
        assignments={[]}
        onMessage={vi.fn()}
      />,
    )
    expect(screen.getByText('Giulia Bianchi')).toBeInTheDocument()

    rerender(
      <VolunteerTable
        searchId="search-1"
        volunteers={[approvedVolunteer()]}
        assignments={[]}
        onMessage={vi.fn()}
      />,
    )

    expect(screen.getByText('Luca Moretti')).toBeInTheDocument()
  })
})
