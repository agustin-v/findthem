import { create } from 'zustand'
import type { SubjectType, SubjectData, ResourcesData } from '@/lib/schemas'

interface SearchCreationState {
  step: number
  subjectType: SubjectType | null
  formData: SubjectData | null
  resourcesData: ResourcesData | null
  setStep: (step: number) => void
  setSubjectType: (type: SubjectType | null) => void
  setFormData: (data: SubjectData | null) => void
  setResourcesData: (data: ResourcesData | null) => void
  reset: () => void
}

const initialState = {
  step: 1,
  subjectType: null as SubjectType | null,
  formData: null as SubjectData | null,
  resourcesData: null as ResourcesData | null,
}

export const useSearchCreationStore = create<SearchCreationState>()((set) => ({
  ...initialState,
  setStep: (step) => set({ step }),
  setSubjectType: (subjectType) => set({ subjectType }),
  setFormData: (formData) => set({ formData }),
  setResourcesData: (resourcesData) => set({ resourcesData }),
  reset: () => set(initialState),
}))
