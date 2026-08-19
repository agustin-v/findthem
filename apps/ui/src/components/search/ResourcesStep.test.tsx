import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResourcesStep } from './ResourcesStep'

// Mock i18next — return key as translation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

function getResourceCard(labelKey: string) {
  const label = screen.getByText(labelKey)
  const card = label.closest('div')
  if (!card) throw new Error(`Could not find resource card for ${labelKey}`)
  return within(card)
}

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

  it('renders all resource types with their steppers always visible', () => {
    render(<ResourcesStep onBack={onBack} onSubmit={onSubmit} />)
    for (const labelKey of ['resources.people', 'resources.motorbikes', 'resources.cars', 'resources.drones']) {
      const card = getResourceCard(labelKey)
      expect(card.getByLabelText('resources.decreaseCount')).toBeInTheDocument()
      expect(card.getByLabelText('resources.increaseCount')).toBeInTheDocument()
    }
  })

  it('stepper increments and decrements a resource count, floored at 0', async () => {
    const user = userEvent.setup()
    render(<ResourcesStep onBack={onBack} onSubmit={onSubmit} />)

    const people = getResourceCard('resources.people')
    const decrement = people.getByLabelText('resources.decreaseCount')
    const increment = people.getByLabelText('resources.increaseCount')

    // Starts at 0 — decrement is a no-op (button disabled) rather than going negative
    expect(decrement).toBeDisabled()
    await user.click(increment)
    await user.click(increment)
    expect(people.getByText('2')).toBeInTheDocument()
    expect(decrement).not.toBeDisabled()

    await user.click(decrement)
    expect(people.getByText('1')).toBeInTheDocument()
  })

  it('onSubmit includes the stepper-adjusted count for a resource with count > 0', async () => {
    const user = userEvent.setup()
    render(<ResourcesStep onBack={onBack} onSubmit={onSubmit} />)

    const people = getResourceCard('resources.people')
    await user.click(people.getByLabelText('resources.increaseCount'))
    await user.click(people.getByLabelText('resources.increaseCount'))
    await user.click(screen.getByText('next'))

    expect(onSubmit.mock.calls[0][0].resources).toEqual([{ type: 'people', count: 2 }])
  })

  it('a resource left at 0 is excluded from submission', async () => {
    const user = userEvent.setup()
    render(<ResourcesStep onBack={onBack} onSubmit={onSubmit} />)

    const people = getResourceCard('resources.people')
    await user.click(people.getByLabelText('resources.increaseCount'))
    await user.click(screen.getByText('next'))

    expect(onSubmit.mock.calls[0][0].resources).toEqual([{ type: 'people', count: 1 }])
  })
})
