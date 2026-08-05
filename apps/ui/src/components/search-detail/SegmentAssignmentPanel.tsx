import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAssignVolunteer, useUnassignVolunteer } from '@/hooks/useSearches'
import type { SegmentAssignment, Volunteer } from '@/lib/api'

interface SegmentAssignmentPanelProps {
  searchId: string
  segmentId: number
  volunteers: Volunteer[]
  assignments: SegmentAssignment[]
  onClose: () => void
}

export function SegmentAssignmentPanel({
  searchId,
  segmentId,
  volunteers,
  assignments,
  onClose,
}: SegmentAssignmentPanelProps) {
  const { t } = useTranslation('dashboard')
  const assign = useAssignVolunteer(searchId)
  const unassign = useUnassignVolunteer(searchId)
  const [pickedVolunteerId, setPickedVolunteerId] = useState('')

  const assignedIds = new Set(
    assignments.filter((a) => a.segmentId === segmentId).map((a) => a.volunteerId),
  )
  const assignedVolunteers = volunteers.filter((v) => assignedIds.has(v.id))
  // Only approved volunteers are assignable server-side (Segments.assign/3
  // rejects anyone else) — filtering them out here avoids an offer the API
  // would just reject.
  const eligibleVolunteers = volunteers.filter(
    (v) => v.status === 'approved' && !assignedIds.has(v.id),
  )

  const handleAssign = () => {
    if (!pickedVolunteerId) return
    assign.mutate(
      { segmentId, volunteerId: pickedVolunteerId },
      { onSuccess: () => setPickedVolunteerId('') },
    )
  }

  return (
    <Card size="sm" className="bg-card/95 backdrop-blur-sm shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('detail.assignment.title', { id: segmentId })}</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label={t('detail.assignment.close')}
        >
          <X />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {assignedVolunteers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('detail.assignment.noneAssigned')}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {assignedVolunteers.map((v) => (
              <div key={v.id} className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm">{v.name}</p>
                {v.resourceType && (
                  <span className="shrink-0 text-[0.7rem] text-muted-foreground">
                    {t(`detail.legend.resource.${v.resourceType}`)}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => unassign.mutate({ segmentId, volunteerId: v.id })}
                  disabled={unassign.isPending}
                  aria-label={t('detail.assignment.unassign')}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}

        {eligibleVolunteers.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <Select value={pickedVolunteerId} onValueChange={setPickedVolunteerId}>
              <SelectTrigger size="sm" className="flex-1">
                <SelectValue placeholder={t('detail.assignment.assignPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {eligibleVolunteers.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              onClick={handleAssign}
              disabled={!pickedVolunteerId || assign.isPending}
            >
              {t('detail.assignment.assign')}
            </Button>
          </div>
        )}

        {(assign.isError || unassign.isError) && (
          <p className="text-[13px] text-destructive">{t('detail.assignment.actionFailed')}</p>
        )}
      </CardContent>
    </Card>
  )
}
