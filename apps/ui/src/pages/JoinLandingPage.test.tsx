import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { JoinLandingPage } from './JoinLandingPage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ code: 'ABC123' }),
}))

// AuthLayout renders ThemeSwitcher/LanguageSwitcher, which read localStorage —
// irrelevant to this page's own logic, so it's stubbed out here.
vi.mock('@/layouts/AuthLayout', () => ({
  AuthLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const mockUseJoinPreview = vi.fn()
vi.mock('@/hooks/useSearches', () => ({
  useJoinPreview: (code: string) => mockUseJoinPreview(code),
}))

describe('JoinLandingPage', () => {
  beforeEach(() => {
    mockUseJoinPreview.mockReset()
  })

  it('shows the subject summary and app deep link when the code is valid', () => {
    mockUseJoinPreview.mockReturnValue({
      data: { subjectType: 'person', subjectName: 'Marco Rossi', area: 'Via del Corso' },
      isLoading: false,
      isError: false,
    })

    render(<JoinLandingPage />)

    expect(screen.getByText('Marco Rossi')).toBeInTheDocument()
    expect(screen.getByText('openApp').closest('a')).toHaveAttribute(
      'href',
      'findthem://join/ABC123',
    )
    expect(screen.getByText('ABC123')).toBeInTheDocument()
  })

  it('shows the not-found state for an invalid code', () => {
    mockUseJoinPreview.mockReturnValue({ data: undefined, isLoading: false, isError: true })

    render(<JoinLandingPage />)

    expect(screen.getByText('notFound.title')).toBeInTheDocument()
    expect(screen.queryByText('openApp')).not.toBeInTheDocument()
  })
})
