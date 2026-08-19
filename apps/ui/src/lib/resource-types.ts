import { Users, Bike, Car, Radar } from 'lucide-react'
import type { ResourceType } from '@/lib/schemas'

// Same resource → color/icon mapping everywhere it appears: the wizard's
// ResourcesStep, the map's segment fill (useSegmentLayer.ts), and the
// search-detail dock/table/chat views — one resource type reads as one
// color and one icon across the whole app, not just on the map. Label
// translation keys differ by namespace per call site (search:resources.*
// vs dashboard:detail.legend.resource.*, same English/Italian copy in
// both), so this only exports icon/color, not a label key.
export const RESOURCE_TYPES: {
  type: ResourceType
  icon: typeof Users
  color: string
}[] = [
  { type: 'people', icon: Users, color: '#3b82f6' },
  { type: 'motorbikes', icon: Bike, color: '#f59e0b' },
  { type: 'cars', icon: Car, color: '#10b981' },
  { type: 'drones', icon: Radar, color: '#8b5cf6' },
]

const BY_TYPE = new Map(RESOURCE_TYPES.map((r) => [r.type, r]))

export function resourceTypeMeta(type: string | null) {
  return type ? (BY_TYPE.get(type as ResourceType) ?? null) : null
}
