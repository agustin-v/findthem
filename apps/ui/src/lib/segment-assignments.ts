import type { SegmentAssignment } from '@/lib/api'

// A volunteer can eventually have more than one assigned segment (e.g. a
// drone and a foot volunteer both covering the same area) — joins them
// into one display string rather than picking just the first.
export function assignedZonesFor(assignments: SegmentAssignment[], volunteerId: string): string | null {
  const ids = assignments.filter((a) => a.volunteerId === volunteerId).map((a) => a.segmentId)
  return ids.length > 0 ? ids.join(', ') : null
}
