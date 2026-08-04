import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvitePanel } from './InvitePanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const mockMutate = vi.fn()
let mockIsError = false
vi.mock('@/hooks/useSearches', () => ({
  useRotateJoinToken: () => ({ mutate: mockMutate, isPending: false, isError: mockIsError }),
}))

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  return writeText
}

describe('InvitePanel', () => {
  beforeEach(() => {
    mockMutate.mockReset()
    mockIsError = false
  })

  it('renders the join link containing the current token', () => {
    render(<InvitePanel searchId="search-1" joinToken="ABCDE12345" />)
    expect(screen.getByText(/\/join\/ABCDE12345$/)).toBeInTheDocument()
  })

  it('copies the join link to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = stubClipboard()
    render(<InvitePanel searchId="search-1" joinToken="ABCDE12345" />)

    await user.click(screen.getByLabelText('detail.invite.copy'))

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/join/ABCDE12345'))
  })

  it('requires confirmation before rotating the token', async () => {
    const user = userEvent.setup()
    render(<InvitePanel searchId="search-1" joinToken="ABCDE12345" />)

    await user.click(screen.getByText('detail.invite.rotate'))
    expect(mockMutate).not.toHaveBeenCalled()

    await user.click(screen.getByText('detail.invite.rotateConfirmYes'))
    expect(mockMutate).toHaveBeenCalledOnce()
  })

  it('cancelling the confirmation does not rotate', async () => {
    const user = userEvent.setup()
    render(<InvitePanel searchId="search-1" joinToken="ABCDE12345" />)

    await user.click(screen.getByText('detail.invite.rotate'))
    await user.click(screen.getByText('detail.invite.cancel'))

    expect(mockMutate).not.toHaveBeenCalled()
    expect(screen.getByText('detail.invite.rotate')).toBeInTheDocument()
  })

  it('shows an error message when the clipboard write fails', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    render(<InvitePanel searchId="search-1" joinToken="ABCDE12345" />)

    await user.click(screen.getByLabelText('detail.invite.copy'))

    expect(screen.getByText('detail.invite.copyFailed')).toBeInTheDocument()
  })

  it('shows an error message when rotating fails', () => {
    mockIsError = true
    render(<InvitePanel searchId="search-1" joinToken="ABCDE12345" />)

    expect(screen.getByText('detail.invite.rotateFailed')).toBeInTheDocument()
  })
})
