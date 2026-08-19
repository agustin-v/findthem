import { useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { it, enUS } from 'date-fns/locale'
import { Check, X, MoreHorizontal, MessageSquare, Search } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSetVolunteerStatus } from '@/hooks/useSearches'
import { resourceTypeMeta } from '@/lib/resource-types'
import { initials } from '@/lib/initials'
import { assignedZonesFor } from '@/lib/segment-assignments'
import type { SegmentAssignment, Volunteer } from '@/lib/api'
import { cn } from '@/lib/utils'

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000

function isOnline(lastActiveAt: string | null) {
  if (!lastActiveAt) return false
  return Date.now() - new Date(lastActiveAt).getTime() < ONLINE_THRESHOLD_MS
}

interface VolunteerTableProps {
  searchId: string
  volunteers: Volunteer[]
  isError?: boolean
  assignments: SegmentAssignment[]
  onMessage: (volunteerId: string) => void
}

export function VolunteerTable({
  searchId,
  volunteers,
  isError,
  assignments,
  onMessage,
}: VolunteerTableProps) {
  const { t } = useTranslation('dashboard')
  const setStatus = useSetVolunteerStatus(searchId)
  const [query, setQuery] = useState('')

  const pending = volunteers.filter((v) => v.status === 'pending')
  const approved = volunteers.filter((v) => v.status === 'approved')
  const filteredApproved = query.trim()
    ? approved.filter((v) => v.name.toLowerCase().includes(query.trim().toLowerCase()))
    : approved

  const [activeSubTab, setActiveSubTab] = useState(pending.length > 0 ? 'pending' : 'active')
  const [prevPendingCount, setPrevPendingCount] = useState(pending.length)

  // If the last pending request is approved/denied while this tab is open,
  // switch away rather than stranding the coordinator on an empty list.
  if (pending.length !== prevPendingCount) {
    setPrevPendingCount(pending.length)
    if (activeSubTab === 'pending' && pending.length === 0) {
      setActiveSubTab('active')
    }
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-destructive">{t('detail.volunteersLoadError')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-6">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="active" className="gap-1.5">
              {t('detail.volunteersActive')}
              <Badge variant="secondary">{approved.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-1.5">
              {t('detail.volunteersPending')}
              {pending.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.65rem] font-medium text-white">
                  {pending.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          {activeSubTab === 'active' && (
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('detail.table.searchPlaceholder')}
                className="h-8 pl-8 text-sm"
              />
            </div>
          )}
        </div>

        <TabsContent value="active" className="mt-3">
          {approved.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('detail.noVolunteers')}
            </p>
          ) : filteredApproved.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('detail.table.noResults')}
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t('detail.table.volunteer')}</th>
                    <th className="px-3 py-2 font-medium">{t('detail.table.mode')}</th>
                    <th className="px-3 py-2 font-medium">{t('detail.table.status')}</th>
                    <th className="px-3 py-2 font-medium">{t('detail.table.assignedZone')}</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredApproved.map((v) => {
                    const mode = resourceTypeMeta(v.resourceType)
                    const online = isOnline(v.lastActiveAt)
                    const zones = assignedZonesFor(assignments, v.id)
                    return (
                      <tr key={v.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                              {initials(v.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{v.name}</p>
                              <p className="truncate text-[0.7rem] text-muted-foreground">
                                {t('detail.zonesSearchedBy', { count: v.segmentsSearched })}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            {mode && <mode.icon className="size-3.5" />}
                            {v.resourceType
                              ? t(`detail.legend.resource.${v.resourceType}`)
                              : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              'flex items-center gap-1.5',
                              online ? 'text-actor-volunteer' : 'text-muted-foreground',
                            )}
                          >
                            <span
                              className={cn(
                                'size-1.5 rounded-full',
                                online ? 'bg-actor-volunteer' : 'bg-muted-foreground/40',
                              )}
                            />
                            {online ? t('detail.online') : t('detail.offline')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-semibold">{zones ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={t('detail.table.rowActions', { name: v.name })}
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onMessage(v.id)}>
                                <MessageSquare />
                                {t('detail.table.message')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setStatus.mutate({ volunteerId: v.id, status: 'removed' })}
                              >
                                <X />
                                {t('detail.remove')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pending" className="mt-3">
          {pending.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('detail.noPending')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pending.map((v) => {
                const mode = resourceTypeMeta(v.resourceType)
                return (
                  <PendingRow
                    key={v.id}
                    volunteer={v}
                    modeIcon={mode?.icon}
                    onApprove={() => setStatus.mutate({ volunteerId: v.id, status: 'approved' })}
                    onDeny={() => setStatus.mutate({ volunteerId: v.id, status: 'removed' })}
                    disabled={setStatus.isPending}
                  />
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {setStatus.isError && (
        <p className="text-[13px] text-destructive">{t('detail.actionFailed')}</p>
      )}
    </div>
  )
}

interface PendingRowProps {
  volunteer: Volunteer
  modeIcon?: ComponentType<{ className?: string }>
  onApprove: () => void
  onDeny: () => void
  disabled: boolean
}

function PendingRow({ volunteer, modeIcon: ModeIcon, onApprove, onDeny, disabled }: PendingRowProps) {
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.language === 'it' ? it : enUS

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {initials(volunteer.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{volunteer.name}</p>
        <p className="flex items-center gap-1 truncate text-[0.75rem] text-muted-foreground">
          {t('detail.table.requestedAgo', {
            time: formatDistanceToNow(new Date(volunteer.joinedAt), { locale }),
          })}
          {volunteer.resourceType && (
            <>
              <span>·</span>
              {ModeIcon && <ModeIcon className="size-3" />}
              {t(`detail.legend.resource.${volunteer.resourceType}`)}
            </>
          )}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        className="gap-1.5 bg-actor-volunteer text-actor-volunteer-soft hover:bg-actor-volunteer/90"
        onClick={onApprove}
        disabled={disabled}
      >
        <Check className="size-3.5" />
        {t('detail.approve')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="text-destructive hover:text-destructive"
        onClick={onDeny}
        disabled={disabled}
        aria-label={t('detail.deny')}
      >
        <X />
      </Button>
    </div>
  )
}
