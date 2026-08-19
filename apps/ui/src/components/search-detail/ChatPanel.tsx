import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, isSameDay } from 'date-fns'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSendMessage } from '@/hooks/useSearches'
import { resourceTypeMeta } from '@/lib/resource-types'
import { initials } from '@/lib/initials'
import { assignedZonesFor } from '@/lib/segment-assignments'
import { cn } from '@/lib/utils'
import type { Message, SegmentAssignment, Volunteer } from '@/lib/api'

const MAX_MESSAGE_LENGTH = 2000
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000

function isOnline(lastActiveAt: string | null) {
  if (!lastActiveAt) return false
  return Date.now() - new Date(lastActiveAt).getTime() < ONLINE_THRESHOLD_MS
}

interface ChatPanelProps {
  searchId: string
  volunteers: Volunteer[]
  messages: Message[]
  isMessagesPending: boolean
  isMessagesError: boolean
  selectedVolunteerId: string | null
  onSelectVolunteer: (volunteerId: string | null) => void
  unreadCountByVolunteer: Map<string, number>
  assignments: SegmentAssignment[]
}

export function ChatPanel({
  searchId,
  volunteers,
  messages,
  isMessagesPending,
  isMessagesError,
  selectedVolunteerId,
  onSelectVolunteer,
  unreadCountByVolunteer,
  assignments,
}: ChatPanelProps) {
  const { t } = useTranslation('dashboard')
  const sendMessage = useSendMessage(searchId)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Only approved volunteers get a NEW thread — matches who a coordinator can
  // actually reach and who VolunteerTable's own message entry point offers.
  // A volunteer who was later removed still resolves here (by id, any
  // status) so a thread that was already open can render its history
  // read-only instead of silently disappearing.
  const approvedVolunteers = volunteers.filter((v) => v.status === 'approved')
  const selectedVolunteer = selectedVolunteerId
    ? (volunteers.find((v) => v.id === selectedVolunteerId) ?? null)
    : null
  const canReplyToSelected = selectedVolunteer?.status === 'approved'

  const messagesByVolunteer = useMemo(() => {
    const map = new Map<string, Message[]>()
    for (const message of messages) {
      const list = map.get(message.volunteerId) ?? []
      list.push(message)
      map.set(message.volunteerId, list)
    }
    return map
  }, [messages])

  // Most-recently-active thread first, so a volunteer who just messaged
  // doesn't get buried below others in a long roster.
  const sortedApprovedVolunteers = useMemo(() => {
    return [...approvedVolunteers].sort((a, b) => {
      const aThread = messagesByVolunteer.get(a.id)
      const bThread = messagesByVolunteer.get(b.id)
      const aLast = aThread?.[aThread.length - 1]?.insertedAt ?? ''
      const bLast = bThread?.[bThread.length - 1]?.insertedAt ?? ''
      return bLast.localeCompare(aLast)
    })
  }, [approvedVolunteers, messagesByVolunteer])

  const thread = selectedVolunteerId ? (messagesByVolunteer.get(selectedVolunteerId) ?? []) : []

  // A thread switch must never carry over a half-typed message into the
  // wrong volunteer's conversation, and a send failure against the
  // previous thread shouldn't linger once the coordinator has moved on.
  // Adjusted during render (not an effect), same pattern VolunteerCard/
  // VolunteerTable use for their own prop-driven resets.
  const [prevSelectedVolunteerId, setPrevSelectedVolunteerId] = useState(selectedVolunteerId)
  if (selectedVolunteerId !== prevSelectedVolunteerId) {
    setPrevSelectedVolunteerId(selectedVolunteerId)
    setDraft('')
    sendMessage.reset()
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread.length, selectedVolunteerId])

  const handleSend = () => {
    const text = draft.trim()
    if (!text || !selectedVolunteerId || sendMessage.isPending) return
    setDraft('')
    sendMessage.mutate(
      { volunteerId: selectedVolunteerId, text },
      // Cleared eagerly above so a slow send doesn't invite a duplicate
      // resend attempt; restored here so a failure doesn't destroy text
      // the coordinator can't easily reconstruct from memory mid-search.
      { onError: () => setDraft(text) },
    )
  }

  const selectedMode = resourceTypeMeta(selectedVolunteer?.resourceType ?? null)
  const selectedZone = selectedVolunteerId ? assignedZonesFor(assignments, selectedVolunteerId) : null

  return (
    <div className="flex h-full">
      <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-border">
        <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('detail.chat.threads')}
        </div>
        {isMessagesError && (
          <p className="px-4 pt-2 text-[13px] text-destructive">{t('detail.chat.loadFailed')}</p>
        )}
        <ThreadList
          volunteers={sortedApprovedVolunteers}
          messagesByVolunteer={messagesByVolunteer}
          unreadCountByVolunteer={unreadCountByVolunteer}
          isPending={isMessagesPending}
          selectedVolunteerId={selectedVolunteerId}
          onSelectVolunteer={onSelectVolunteer}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col" data-testid="thread-view">
        {!selectedVolunteer ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {t('detail.chat.selectThread')}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {initials(selectedVolunteer.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{selectedVolunteer.name}</p>
                <p className="flex items-center gap-1.5 truncate text-[0.7rem] text-muted-foreground">
                  {canReplyToSelected ? (
                    <>
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          isOnline(selectedVolunteer.lastActiveAt)
                            ? 'bg-actor-volunteer'
                            : 'bg-muted-foreground/40',
                        )}
                      />
                      {selectedMode && <selectedMode.icon className="size-3" />}
                      {selectedVolunteer.resourceType &&
                        t(`detail.legend.resource.${selectedVolunteer.resourceType}`)}
                      {selectedZone && (
                        <>
                          <span>·</span>
                          {t('detail.table.zone', { id: selectedZone })}
                        </>
                      )}
                    </>
                  ) : (
                    t('detail.chat.volunteerRemoved')
                  )}
                </p>
              </div>
            </div>

            <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 py-3">
              {isMessagesPending ? (
                <p className="text-sm text-muted-foreground">{t('detail.chat.loading')}</p>
              ) : thread.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('detail.chat.noMessages')}</p>
              ) : (
                thread.map((message, i) => {
                  const prev = thread[i - 1]
                  const showDivider = !prev || !isSameDay(new Date(prev.insertedAt), new Date(message.insertedAt))
                  return (
                    <div key={message.id} className="flex flex-col">
                      {showDivider && (
                        <div className="my-2 flex justify-center">
                          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.65rem] text-muted-foreground">
                            {isSameDay(new Date(message.insertedAt), new Date())
                              ? t('detail.chat.today')
                              : format(new Date(message.insertedAt), 'MMM d')}
                            {' · '}
                            {format(new Date(message.insertedAt), 'HH:mm')}
                          </span>
                        </div>
                      )}
                      <div
                        className={cn(
                          'flex flex-col',
                          message.sender === 'coordinator' ? 'items-end' : 'items-start',
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[70%] rounded-lg px-2.5 py-1.5 text-sm',
                            message.sender === 'coordinator'
                              ? 'bg-actor-coordinator text-actor-coordinator-soft'
                              : 'bg-muted text-foreground',
                          )}
                        >
                          {message.text}
                        </div>
                        <span className="mt-0.5 text-[0.65rem] text-muted-foreground">
                          {format(new Date(message.insertedAt), 'HH:mm')}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {canReplyToSelected ? (
              <div className="border-t border-border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    placeholder={t('detail.chat.placeholderTo', { name: selectedVolunteer.name.split(' ')[0] })}
                    maxLength={MAX_MESSAGE_LENGTH}
                    className="h-9 flex-1"
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    onClick={handleSend}
                    disabled={!draft.trim() || sendMessage.isPending}
                    aria-label={t('detail.chat.send')}
                  >
                    <Send />
                  </Button>
                </div>
                {sendMessage.isError && (
                  <p className="mt-1.5 text-[13px] text-destructive">{t('detail.chat.sendFailed')}</p>
                )}
              </div>
            ) : (
              <div className="border-t border-border p-3 text-center text-[13px] text-muted-foreground">
                {t('detail.chat.volunteerRemoved')}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface ThreadListProps {
  volunteers: Volunteer[]
  messagesByVolunteer: Map<string, Message[]>
  unreadCountByVolunteer: Map<string, number>
  isPending: boolean
  selectedVolunteerId: string | null
  onSelectVolunteer: (volunteerId: string) => void
}

function ThreadList({
  volunteers,
  messagesByVolunteer,
  unreadCountByVolunteer,
  isPending,
  selectedVolunteerId,
  onSelectVolunteer,
}: ThreadListProps) {
  const { t } = useTranslation('dashboard')

  if (volunteers.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">{t('detail.chat.noVolunteers')}</p>
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto py-1">
      {volunteers.map((v) => {
        const thread = messagesByVolunteer.get(v.id) ?? []
        const last = thread[thread.length - 1]
        const preview = isPending ? t('detail.chat.loading') : last ? last.text : t('detail.chat.noMessages')
        const unread = unreadCountByVolunteer.get(v.id) ?? 0
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelectVolunteer(v.id)}
            className={cn(
              'flex items-center gap-2.5 border-l-2 px-3 py-2.5 text-left hover:bg-muted',
              selectedVolunteerId === v.id
                ? 'border-l-actor-coordinator bg-muted'
                : 'border-l-transparent',
            )}
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {initials(v.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-sm', unread > 0 ? 'font-semibold' : 'font-medium')}>
                {v.name}
              </p>
              <p className="truncate text-[0.75rem] text-muted-foreground">{preview}</p>
            </div>
            {unread > 0 && (
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-[0.6rem] font-medium text-white">
                {unread}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
