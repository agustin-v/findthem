import { useSearchCreationStore } from './useSearchCreationStore'
import type { PersonData, ResourcesData } from '@/lib/schemas'

const { getState } = useSearchCreationStore

beforeEach(() => {
  getState().reset()
})

describe('useSearchCreationStore', () => {
  it('has correct initial state', () => {
    const state = getState()
    expect(state.step).toBe(1)
    expect(state.subjectType).toBeNull()
    expect(state.formData).toBeNull()
    expect(state.resourcesData).toBeNull()
  })

  it('setStep updates step', () => {
    getState().setStep(3)
    expect(getState().step).toBe(3)
  })

  it('setSubjectType updates subjectType', () => {
    getState().setSubjectType('person')
    expect(getState().subjectType).toBe('person')
  })

  it('setFormData updates formData', () => {
    const data: PersonData = {
      name: 'Marco',
      age: 72,
      physicalDescription: 'Tall',
      lastSeenAt: '2026-05-07T14:30:00Z',
      lastSeenLocation: 'Via del Corso',
    }
    getState().setFormData(data)
    expect(getState().formData).toEqual(data)
  })

  it('setResourcesData updates resourcesData', () => {
    const data: ResourcesData = {
      radiusKm: 1.5,
      needSuggestion: false,
      resources: [{ type: 'people', count: 4 }],
    }
    getState().setResourcesData(data)
    expect(getState().resourcesData).toEqual(data)
  })

  it('reset restores initial state', () => {
    getState().setStep(3)
    getState().setSubjectType('animal')
    getState().reset()

    const state = getState()
    expect(state.step).toBe(1)
    expect(state.subjectType).toBeNull()
    expect(state.formData).toBeNull()
    expect(state.resourcesData).toBeNull()
  })

  it('setSubjectType to null clears it', () => {
    getState().setSubjectType('person')
    getState().setSubjectType(null)
    expect(getState().subjectType).toBeNull()
  })
})
