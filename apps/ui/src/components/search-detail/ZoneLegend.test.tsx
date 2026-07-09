import { render, screen } from '@testing-library/react'
import { ZoneLegend } from './ZoneLegend'

// Mock i18next — return the key as translation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock router params
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ searchId: 'test-123' }),
}))

// Mock the geo segments store
const mockUseGeoSegmentsStore = vi.fn()
vi.mock('@/stores/useGeoSegmentsStore', () => ({
  useGeoSegmentsStore: (selector: (s: unknown) => unknown) =>
    mockUseGeoSegmentsStore(selector),
}))

describe('ZoneLegend', () => {
  beforeEach(() => {
    mockUseGeoSegmentsStore.mockReset()
  })

  it('renders fallback segment legend when no resource assignment', () => {
    mockUseGeoSegmentsStore.mockReturnValue(undefined)
    render(<ZoneLegend />)
    expect(screen.getByText('detail.legend.segment')).toBeInTheDocument()
    expect(screen.getByText('detail.legend.restricted')).toBeInTheDocument()
  })

  it('renders the legend title', () => {
    mockUseGeoSegmentsStore.mockReturnValue(undefined)
    render(<ZoneLegend />)
    expect(screen.getByText('detail.legend.title')).toBeInTheDocument()
  })

  it('renders resource type items when resource_assignment is present', () => {
    mockUseGeoSegmentsStore.mockReturnValue({
      resource_assignment: { people: 4, cars: 2 },
    })
    render(<ZoneLegend />)
    expect(screen.getByText('detail.legend.resource.people')).toBeInTheDocument()
    expect(screen.getByText('detail.legend.resource.cars')).toBeInTheDocument()
    expect(screen.getByText('detail.legend.restricted')).toBeInTheDocument()
    // Static "segment" fallback should not appear
    expect(screen.queryByText('detail.legend.segment')).not.toBeInTheDocument()
  })

  it('renders restricted area in all modes', () => {
    mockUseGeoSegmentsStore.mockReturnValue({
      resource_assignment: { drones: 1 },
    })
    render(<ZoneLegend />)
    expect(screen.getByText('detail.legend.restricted')).toBeInTheDocument()
  })
})
