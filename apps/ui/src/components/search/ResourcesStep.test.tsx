import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResourcesStep } from './ResourcesStep'

// Mock i18next — return key as translation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('ResourcesStep', () => {
  const onBack = vi.fn()
  const onSubmit = vi.fn()

  beforeEach(() => {
    onBack.mockReset()
    onSubmit.mockReset()
  })

  it('renders radius input with default value', () => {
    render(<ResourcesStep onBack={onBack} onSubmit={onSubmit} />)
    const input = screen.getByLabelText('resources.radius') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('1.5')
  })

  it('onSubmit includes radiusKm', async () => {
    const user = userEvent.setup()
    render(<ResourcesStep onBack={onBack} onSubmit={onSubmit} />)

    // Toggle the "I don't have resources" option to enable submission
    const toggle = screen.getByText('resources.toggle')
    await user.click(toggle)

    // Click next
    const nextButton = screen.getByText('next')
    await user.click(nextButton)

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit.mock.calls[0][0]).toHaveProperty('radiusKm', 1.5)
  })

  it('renders resource type toggles', () => {
    render(<ResourcesStep onBack={onBack} onSubmit={onSubmit} />)
    expect(screen.getByText('resources.people')).toBeInTheDocument()
    expect(screen.getByText('resources.motorbikes')).toBeInTheDocument()
    expect(screen.getByText('resources.cars')).toBeInTheDocument()
    expect(screen.getByText('resources.drones')).toBeInTheDocument()
  })
})
