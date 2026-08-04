import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VolunteerCard } from './VolunteerCard'
import type { Volunteer } from '@/lib/api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
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
    resourceType: null,
    status: 'pending',
    lastActiveAt: null,
    joinedAt: '2026-08-01T10:00:00Z',
    approvedAt: null,
    removedAt: null,
    zonesSearched: 0,
    ...overrides,
  }
}

function approvedVolunteer(overrides: Partial<Volunteer> = {}): Volunteer {
  return {
    id: 'vol-approved',
    name: 'Luca Moretti',
    phone: '+390698766',
    resourceType: 'people',
    status: 'approved',
    lastActiveAt: null,
    joinedAt: '2026-08-01T09:00:00Z',
    approvedAt: '2026-08-01T09:05:00Z',
    removedAt: null,
    zonesSearched: 2,
    ...overrides,
  }
}

describe('VolunteerCard', () => {
  beforeEach(() => {
    mockMutate.mockReset()
    mockIsError = false
  })

  it('defaults to the pending tab when there are pending volunteers', () => {
    render(<VolunteerCard searchId="search-1" volunteers={[pendingVolunteer()]} />)
    expect(screen.getByText('Giulia Bianchi')).toBeInTheDocument()
  })

  it('approving a pending volunteer calls setStatus with approved', async () => {
    const user = userEvent.setup()
    render(<VolunteerCard searchId="search-1" volunteers={[pendingVolunteer()]} />)

    await user.click(screen.getByLabelText('detail.approve'))

    expect(mockMutate).toHaveBeenCalledWith({ volunteerId: 'vol-pending', status: 'approved' })
  })

  it('denying a pending volunteer calls setStatus with removed', async () => {
    const user = userEvent.setup()
    render(<VolunteerCard searchId="search-1" volunteers={[pendingVolunteer()]} />)

    await user.click(screen.getByLabelText('detail.deny'))

    expect(mockMutate).toHaveBeenCalledWith({ volunteerId: 'vol-pending', status: 'removed' })
  })

  it('shows approved volunteers under the active tab with zones searched', async () => {
    const user = userEvent.setup()
    render(<VolunteerCard searchId="search-1" volunteers={[approvedVolunteer()]} />)

    await user.click(screen.getByText('detail.volunteersActive'))

    expect(screen.getByText('Luca Moretti')).toBeInTheDocument()
  })

  it('removing an approved volunteer calls setStatus with removed', async () => {
    const user = userEvent.setup()
    render(<VolunteerCard searchId="search-1" volunteers={[approvedVolunteer()]} />)

    await user.click(screen.getByText('detail.volunteersActive'))
    await user.click(screen.getByLabelText('detail.remove'))

    expect(mockMutate).toHaveBeenCalledWith({ volunteerId: 'vol-approved', status: 'removed' })
  })

  it('excludes removed volunteers from the header count', () => {
    render(
      <VolunteerCard
        searchId="search-1"
        volunteers={[approvedVolunteer(), pendingVolunteer({ id: 'vol-removed', status: 'removed' })]}
      />,
    )

    expect(screen.getByText('detail.volunteersTitle (1)')).toBeInTheDocument()
  })

  it('shows a load-error message instead of the tabs when the list failed to fetch', () => {
    render(<VolunteerCard searchId="search-1" volunteers={[]} isError />)

    expect(screen.getByText('detail.volunteersLoadError')).toBeInTheDocument()
    expect(screen.queryByText('detail.volunteersActive')).not.toBeInTheDocument()
  })

  it('shows an action-failed message when a mutation errors', () => {
    mockIsError = true
    render(<VolunteerCard searchId="search-1" volunteers={[pendingVolunteer()]} />)

    expect(screen.getByText('detail.actionFailed')).toBeInTheDocument()
  })

  it('switches away from the pending tab once the last pending request is resolved', () => {
    const { rerender } = render(
      <VolunteerCard searchId="search-1" volunteers={[pendingVolunteer()]} />,
    )
    expect(screen.getByText('Giulia Bianchi')).toBeInTheDocument()

    rerender(<VolunteerCard searchId="search-1" volunteers={[approvedVolunteer()]} />)

    expect(screen.getByText('Luca Moretti')).toBeInTheDocument()
  })
})
