import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { it, enUS } from 'date-fns/locale'
import { Check, X } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSetVolunteerStatus } from '@/hooks/useSearches'
import type { Volunteer } from '@/lib/api'
import { cn } from '@/lib/utils'

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function isOnline(lastActiveAt: string | null) {
  if (!lastActiveAt) return false
  return Date.now() - new Date(lastActiveAt).getTime() < ONLINE_THRESHOLD_MS
}

interface VolunteerCardProps {
  searchId: string
  volunteers: Volunteer[]
  isError?: boolean
}

export function VolunteerCard({ searchId, volunteers, isError }: VolunteerCardProps) {
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.language === 'it' ? it : enUS
  const setStatus = useSetVolunteerStatus(searchId)

  const pending = volunteers.filter((v) => v.status === 'pending')
  const approved = volunteers.filter((v) => v.status === 'approved')

  const [activeTab, setActiveTab] = useState(pending.length > 0 ? 'pending' : 'active')
  const [prevPendingCount, setPrevPendingCount] = useState(pending.length)

  // If the last pending request is approved/denied while this tab is open,
  // switch away rather than stranding the coordinator on an empty list.
  // Adjusted during render (not an effect) per React's "you might not need
  // an effect" pattern for state that depends on a prop change.
  if (pending.length !== prevPendingCount) {
    setPrevPendingCount(pending.length)
    if (activeTab === 'pending' && pending.length === 0) {
      setActiveTab('active')
    }
  }

  return (
    <Card size="sm" className="bg-card/95 backdrop-blur-sm shadow-lg">
      <CardHeader>
        <CardTitle>
          {t('detail.volunteersTitle')} ({pending.length + approved.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isError ? (
          <p className="py-2 text-sm text-destructive">{t('detail.volunteersLoadError')}</p>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="active" className="flex-1">
                {t('detail.volunteersActive')}
              </TabsTrigger>
              <TabsTrigger value="pending" className="flex-1">
                {t('detail.volunteersPending')}
                {pending.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {pending.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              {approved.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">{t('detail.noVolunteers')}</p>
              ) : (
                <div className="flex max-h-52 flex-col gap-1.5 overflow-y-auto py-1">
                  {approved.map((v) => (
                    <div key={v.id} className="flex items-center gap-2.5">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {getInitials(v.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{v.name}</p>
                        <p className="truncate text-[0.7rem] text-muted-foreground">
                          {t('detail.zonesSearchedBy', { count: v.zonesSearched })}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          isOnline(v.lastActiveAt) ? 'bg-green-500' : 'bg-muted-foreground/30',
                        )}
                        title={isOnline(v.lastActiveAt) ? t('detail.online') : t('detail.offline')}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setStatus.mutate({ volunteerId: v.id, status: 'removed' })}
                        disabled={setStatus.isPending}
                        aria-label={t('detail.remove')}
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="pending">
              {pending.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">{t('detail.noPending')}</p>
              ) : (
                <div className="flex max-h-52 flex-col gap-1.5 overflow-y-auto py-1">
                  {pending.map((v) => (
                    <div key={v.id} className="flex items-center gap-2.5">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {getInitials(v.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{v.name}</p>
                        <p className="truncate text-[0.7rem] text-muted-foreground">
                          {formatDistanceToNow(new Date(v.joinedAt), { locale, addSuffix: true })}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-green-600 hover:text-green-700"
                        onClick={() => setStatus.mutate({ volunteerId: v.id, status: 'approved' })}
                        disabled={setStatus.isPending}
                        aria-label={t('detail.approve')}
                      >
                        <Check />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setStatus.mutate({ volunteerId: v.id, status: 'removed' })}
                        disabled={setStatus.isPending}
                        aria-label={t('detail.deny')}
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
        {setStatus.isError && (
          <p className="mt-2 text-[13px] text-destructive">{t('detail.actionFailed')}</p>
        )}
      </CardContent>
    </Card>
  )
}
