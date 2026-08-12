import { create } from 'zustand'

// Photo uploads after search creation are fire-and-forget from the
// wizard's point of view (NewSearchPage navigates away regardless of
// outcome, same as segment generation) — this is the only place a
// failure gets recorded so SearchDetailPage can actually tell the
// coordinator something didn't make it, instead of a silent
// console.warn that only devtools would ever see.
interface PhotoUploadFailure {
  failed: number
  total: number
}

interface PhotoUploadState {
  failuresBySearch: Record<string, PhotoUploadFailure>
  setFailures: (searchId: string, failed: number, total: number) => void
  clear: (searchId: string) => void
}

export const usePhotoUploadStore = create<PhotoUploadState>()((set) => ({
  failuresBySearch: {},
  setFailures: (searchId, failed, total) =>
    set((state) => ({
      failuresBySearch: { ...state.failuresBySearch, [searchId]: { failed, total } },
    })),
  clear: (searchId) =>
    set((state) => ({
      failuresBySearch: Object.fromEntries(
        Object.entries(state.failuresBySearch).filter(([id]) => id !== searchId),
      ),
    })),
}))
