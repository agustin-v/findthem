import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JoinSearchInput } from './JoinSearchInput'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

describe('JoinSearchInput', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
  })

  it('disables the join button until a code is entered', async () => {
    const user = userEvent.setup()
    render(<JoinSearchInput />)

    const button = screen.getByText('join')
    expect(button).toBeDisabled()

    await user.type(screen.getByPlaceholderText('searchCode'), 'ABC123')
    expect(button).not.toBeDisabled()
  })

  it('navigates to the join landing page with the trimmed code', async () => {
    const user = userEvent.setup()
    render(<JoinSearchInput />)

    await user.type(screen.getByPlaceholderText('searchCode'), '  ABC123  ')
    await user.click(screen.getByText('join'))

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/join/$code',
      params: { code: 'ABC123' },
    })
  })

  it('submits on Enter', async () => {
    const user = userEvent.setup()
    render(<JoinSearchInput />)

    await user.type(screen.getByPlaceholderText('searchCode'), 'XYZ789{Enter}')

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/join/$code',
      params: { code: 'XYZ789' },
    })
  })
})
