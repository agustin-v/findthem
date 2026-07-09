import { create } from 'zustand'
import type { FeatureCollection } from 'geojson'
import type { SegmentsMeta } from '@/lib/geo-api'

interface GeoSegmentsState {
  segmentsBySearch: Record<string, FeatureCollection>
  restrictedAreasBySearch: Record<string, FeatureCollection>
  metaBySearch: Record<string, SegmentsMeta>
  loading: boolean
  error: string | null
  setResponse: (
    searchId: string,
    data: {
      segments: FeatureCollection
      restricted_areas: FeatureCollection
      meta: SegmentsMeta
    },
  ) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clear: (searchId: string) => void
}

export const useGeoSegmentsStore = create<GeoSegmentsState>()((set) => ({
  segmentsBySearch: {},
  restrictedAreasBySearch: {},
  metaBySearch: {},
  loading: false,
  error: null,
  setResponse: (searchId, data) =>
    set((state) => ({
      segmentsBySearch: { ...state.segmentsBySearch, [searchId]: data.segments },
      restrictedAreasBySearch: { ...state.restrictedAreasBySearch, [searchId]: data.restricted_areas },
      metaBySearch: { ...state.metaBySearch, [searchId]: data.meta },
      loading: false,
      error: null,
    })),
  setLoading: (loading) => set({ loading, error: loading ? null : undefined }),
  setError: (error) => set({ error, loading: false }),
  clear: (searchId) =>
    set((state) => {
      const { [searchId]: _s, ...segmentsBySearch } = state.segmentsBySearch
      const { [searchId]: _r, ...restrictedAreasBySearch } = state.restrictedAreasBySearch
      const { [searchId]: _m, ...metaBySearch } = state.metaBySearch
      return { segmentsBySearch, restrictedAreasBySearch, metaBySearch }
    }),
}))
