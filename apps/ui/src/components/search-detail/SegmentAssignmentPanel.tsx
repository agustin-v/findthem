import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, LockOpen, X } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAssignVolunteer, useUnassignVolunteer, useLockSegment, useUnlockSegment } from '@/hooks/useSearches'
import type { SegmentAssignment, SegmentStatusEntry, Volunteer } from '@/lib/api'

interface SegmentAssignmentPanelProps {
  searchId: string
  segmentId: number
  volunteers: Volunteer[]
  assignments: SegmentAssignment[]
  segmentStatus: SegmentStatusEntry | undefined
  onClose: () => void
}

export function SegmentAssignmentPanel({
  searchId,
  segmentId,
  volunteers,
  assignments,
  segmentStatus,
  onClose,
}: SegmentAssignmentPanelProps) {
  const { t } = useTranslation('dashboard')
  const assign = useAssignVolunteer(searchId)
  const unassign = useUnassignVolunteer(searchId)
  const lock = useLockSegment(searchId)
  const unlock = useUnlockSegment(searchId)
  const [pickedVolunteerId, setPickedVolunteerId] = useState('')
  const approvedVolunteers = volunteers.filter((v) => v.status === 'approved')
  // Pre-fill from the segment's own searched_by_volunteer_id when it names
  // an approved volunteer — a coordinator locking after that volunteer went
  // offline mid-sweep is the common case, but the choice must still be
  // explicit (see Segments.lock/4's own comment: this field is
  // volunteer-writable, so the backend never infers it server-side).
  const suggestedVolunteerId = approvedVolunteers.some(
    (v) => v.id === segmentStatus?.searchedByVolunteerId,
  )
    ? (segmentStatus?.searchedByVolunteerId ?? '')
    : ''
  const [pickedLockVolunteerId, setPickedLockVolunteerId] = useState(suggestedVolunteerId)
  const [lockReason, setLockReason] = useState('')
  const isLocked = segmentStatus?.lockedAt != null
  const lockedForVolunteer = volunteers.find((v) => v.id === segmentStatus?.lockedForVolunteerId)

  const handleLock = () => {
    if (!pickedLockVolunteerId) return
    lock.mutate(
      { segmentId, lockedForVolunteerId: pickedLockVolunteerId, lockReason: lockReason || undefined },
      { onSuccess: () => setLockReason('') },
    )
  }

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

        <div className="flex flex-col gap-2 border-t border-border pt-2">
          {isLocked ? (
            <>
              <div className="flex items-center gap-1.5 text-sm">
                <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {lockedForVolunteer
                    ? t('detail.assignment.lock.lockedFor', { name: lockedForVolunteer.name })
                    : t('detail.assignment.lock.lockedGeneric')}
                </span>
              </div>
              <p className="text-[0.7rem] text-muted-foreground">
                {segmentStatus?.lockReason || t('detail.assignment.lock.reasonNone')}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 self-start"
                onClick={() => unlock.mutate(segmentId)}
                disabled={unlock.isPending}
              >
                <LockOpen className="size-3.5" />
                {t('detail.assignment.lock.unlockButton')}
              </Button>
            </>
          ) : (
            approvedVolunteers.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <Select value={pickedLockVolunteerId} onValueChange={setPickedLockVolunteerId}>
                    <SelectTrigger size="sm" className="flex-1">
                      <SelectValue placeholder={t('detail.assignment.lock.pickVolunteerPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {approvedVolunteers.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  placeholder={t('detail.assignment.lock.reasonPlaceholder')}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 self-start"
                  onClick={handleLock}
                  disabled={!pickedLockVolunteerId || lock.isPending}
                >
                  <Lock className="size-3.5" />
                  {t('detail.assignment.lock.lockButton')}
                </Button>
              </>
            )
          )}
          {(lock.isError || unlock.isError) && (
            <p className="text-[13px] text-destructive">{t('detail.assignment.lock.actionFailed')}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
