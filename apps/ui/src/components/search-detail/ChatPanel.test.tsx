import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatPanel } from './ChatPanel'
import type { Message, SegmentAssignment, Volunteer } from '@/lib/api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${JSON.stringify(opts)}` : key,
  }),
}))

const mockSendMutate = vi.fn()
let mockSendIsPending = false
let mockSendIsError = false
const mockSendReset = vi.fn()

vi.mock('@/hooks/useSearches', () => ({
  useSendMessage: () => ({
    mutate: mockSendMutate,
    reset: mockSendReset,
    isPending: mockSendIsPending,
    isError: mockSendIsError,
  }),
}))

function approvedVolunteer(overrides: Partial<Volunteer> = {}): Volunteer {
  return {
    id: 'vol-1',
    name: 'Luca Moretti',
    phone: '+390698766',
    resourceType: 'people',
    status: 'approved',
    consentLocation: false,
    lastLocation: null,
    lastActiveAt: null,
    joinedAt: '2026-08-01T09:00:00Z',
    approvedAt: '2026-08-01T09:05:00Z',
    removedAt: null,
    segmentsSearched: 2,
    ...overrides,
  }
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    searchId: 'search-1',
    volunteerId: 'vol-1',
    sender: 'coordinator',
    text: 'Hello',
    insertedAt: '2026-08-01T10:00:00Z',
    ...overrides,
  }
}

interface RenderOverrides {
  volunteers?: Volunteer[]
  messages?: Message[]
  isMessagesPending?: boolean
  isMessagesError?: boolean
  selectedVolunteerId?: string | null
  onSelectVolunteer?: (volunteerId: string | null) => void
  unreadCountByVolunteer?: Map<string, number>
  assignments?: SegmentAssignment[]
}

function renderChatPanel(overrides: RenderOverrides = {}) {
  const onSelectVolunteer = overrides.onSelectVolunteer ?? vi.fn()
  render(
    <ChatPanel
      searchId="search-1"
      volunteers={overrides.volunteers ?? [approvedVolunteer()]}
      messages={overrides.messages ?? []}
      isMessagesPending={overrides.isMessagesPending ?? false}
      isMessagesError={overrides.isMessagesError ?? false}
      selectedVolunteerId={overrides.selectedVolunteerId ?? null}
      onSelectVolunteer={onSelectVolunteer}
      unreadCountByVolunteer={overrides.unreadCountByVolunteer ?? new Map()}
      assignments={overrides.assignments ?? []}
    />,
  )
  return { onSelectVolunteer }
}

describe('ChatPanel', () => {
  beforeEach(() => {
    mockSendMutate.mockReset()
    mockSendReset.mockReset()
    mockSendIsPending = false
    mockSendIsError = false
  })

  it('shows a no-volunteers message when there are no approved volunteers', () => {
    renderChatPanel({ volunteers: [] })
    expect(screen.getByText('detail.chat.noVolunteers')).toBeInTheDocument()
  })

  it('prompts to pick a thread when none is selected', () => {
    renderChatPanel()
    expect(screen.getByText('detail.chat.selectThread')).toBeInTheDocument()
  })

  it('excludes pending/removed volunteers from the thread list', () => {
    renderChatPanel({
      volunteers: [
        approvedVolunteer(),
        approvedVolunteer({ id: 'vol-2', name: 'Pending Guy', status: 'pending' }),
      ],
    })

    expect(screen.getByText('Luca Moretti')).toBeInTheDocument()
    expect(screen.queryByText('Pending Guy')).not.toBeInTheDocument()
  })

  it('shows the last message as a preview in the thread list', () => {
    renderChatPanel({
      messages: [message({ text: 'First' }), message({ id: 'msg-2', text: 'Latest' })],
    })

    expect(screen.getByText('Latest')).toBeInTheDocument()
    expect(screen.queryByText('First')).not.toBeInTheDocument()
  })

  it('sorts the thread list by most recent message activity', () => {
    renderChatPanel({
      volunteers: [approvedVolunteer(), approvedVolunteer({ id: 'vol-2', name: 'Andrea' })],
      messages: [
        message({ id: 'msg-1', volunteerId: 'vol-1', insertedAt: '2026-08-01T09:00:00Z' }),
        message({ id: 'msg-2', volunteerId: 'vol-2', insertedAt: '2026-08-01T11:00:00Z' }),
      ],
    })

    const andreaEl = screen.getByText('Andrea')
    const lucaEl = screen.getByText('Luca Moretti')
    const isAndreaBeforeLuca = Boolean(
      andreaEl.compareDocumentPosition(lucaEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(isAndreaBeforeLuca).toBe(true)
  })

  it('shows an unread count badge for a thread with unread messages', () => {
    renderChatPanel({ unreadCountByVolunteer: new Map([['vol-1', 3]]) })
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('selecting a thread from the list calls onSelectVolunteer', async () => {
    const user = userEvent.setup()
    const { onSelectVolunteer } = renderChatPanel()

    await user.click(screen.getByText('Luca Moretti'))

    expect(onSelectVolunteer).toHaveBeenCalledWith('vol-1')
  })

  it('renders only the selected volunteer thread, distinguishing sender, with a timestamp', () => {
    renderChatPanel({
      selectedVolunteerId: 'vol-1',
      messages: [
        message({ id: 'msg-1', sender: 'coordinator', text: 'From coordinator' }),
        message({ id: 'msg-2', sender: 'volunteer', text: 'From volunteer' }),
        message({ id: 'msg-3', volunteerId: 'vol-other', text: 'Other thread' }),
      ],
    })

    const threadView = within(screen.getByTestId('thread-view'))
    expect(threadView.getByText('From coordinator')).toBeInTheDocument()
    expect(threadView.getByText('From volunteer')).toBeInTheDocument()
    expect(screen.queryByText('Other thread')).not.toBeInTheDocument()
    expect(threadView.getAllByText(/\d{2}:\d{2}/).length).toBeGreaterThan(0)
  })

  it('shows the assigned zone in the thread header', () => {
    renderChatPanel({
      selectedVolunteerId: 'vol-1',
      assignments: [{ segmentId: 4, volunteerId: 'vol-1', assignedAt: '2026-08-01T09:00:00Z' }],
    })
    expect(screen.getByText(/detail.table.zone/)).toBeInTheDocument()
  })

  it('shows an empty-thread message when the selected volunteer has no messages', () => {
    renderChatPanel({ selectedVolunteerId: 'vol-1' })
    expect(within(screen.getByTestId('thread-view')).getByText('detail.chat.noMessages')).toBeInTheDocument()
  })

  it('shows a loading state instead of an empty-thread message while messages are pending', () => {
    renderChatPanel({ selectedVolunteerId: 'vol-1', isMessagesPending: true })
    const threadView = within(screen.getByTestId('thread-view'))
    expect(threadView.getByText('detail.chat.loading')).toBeInTheDocument()
    expect(threadView.queryByText('detail.chat.noMessages')).not.toBeInTheDocument()
  })

  it('typing and clicking send calls sendMessage.mutate with the trimmed text and clears the draft', async () => {
    const user = userEvent.setup()
    renderChatPanel({ selectedVolunteerId: 'vol-1' })

    const input = screen.getByPlaceholderText(/detail.chat.placeholderTo/)
    await user.type(input, '  Hi there  ')
    await user.click(screen.getByLabelText('detail.chat.send'))

    expect(mockSendMutate).toHaveBeenCalledWith(
      { volunteerId: 'vol-1', text: 'Hi there' },
      expect.objectContaining({ onError: expect.any(Function) }),
    )
    expect(input).toHaveValue('')
  })

  it('caps the composer at 2000 characters, matching the server-side limit', () => {
    renderChatPanel({ selectedVolunteerId: 'vol-1' })
    expect(screen.getByPlaceholderText(/detail.chat.placeholderTo/)).toHaveAttribute('maxlength', '2000')
  })

  it('restores the draft if the send fails', async () => {
    const user = userEvent.setup()
    renderChatPanel({ selectedVolunteerId: 'vol-1' })

    const input = screen.getByPlaceholderText(/detail.chat.placeholderTo/)
    await user.type(input, 'Important instruction')
    await user.click(screen.getByLabelText('detail.chat.send'))
    expect(input).toHaveValue('')

    const onError = mockSendMutate.mock.calls[0][1].onError as () => void
    act(() => onError())

    expect(input).toHaveValue('Important instruction')
  })

  it('clears the draft and resets send state when switching to a different thread', () => {
    const volunteers = [approvedVolunteer(), approvedVolunteer({ id: 'vol-2', name: 'Andrea' })]
    const { rerender } = render(
      <ChatPanel
        searchId="search-1"
        volunteers={volunteers}
        messages={[]}
        isMessagesPending={false}
        isMessagesError={false}
        selectedVolunteerId="vol-1"
        onSelectVolunteer={vi.fn()}
        unreadCountByVolunteer={new Map()}
        assignments={[]}
      />,
    )

    const input = screen.getByPlaceholderText(/detail.chat.placeholderTo/)
    input.focus()

    rerender(
      <ChatPanel
        searchId="search-1"
        volunteers={volunteers}
        messages={[]}
        isMessagesPending={false}
        isMessagesError={false}
        selectedVolunteerId="vol-2"
        onSelectVolunteer={vi.fn()}
        unreadCountByVolunteer={new Map()}
        assignments={[]}
      />,
    )

    expect(screen.getByPlaceholderText(/detail.chat.placeholderTo/)).toHaveValue('')
    expect(mockSendReset).toHaveBeenCalled()
  })

  it('pressing Enter sends the message', async () => {
    const user = userEvent.setup()
    renderChatPanel({ selectedVolunteerId: 'vol-1' })

    await user.type(screen.getByPlaceholderText(/detail.chat.placeholderTo/), 'Quick note{Enter}')

    expect(mockSendMutate).toHaveBeenCalledWith(
      { volunteerId: 'vol-1', text: 'Quick note' },
      expect.objectContaining({ onError: expect.any(Function) }),
    )
  })

  it('does not send a blank/whitespace-only message', async () => {
    const user = userEvent.setup()
    renderChatPanel({ selectedVolunteerId: 'vol-1' })

    await user.type(screen.getByPlaceholderText(/detail.chat.placeholderTo/), '   ')
    expect(screen.getByLabelText('detail.chat.send')).toBeDisabled()

    expect(mockSendMutate).not.toHaveBeenCalled()
  })

  it('disables the send button while a message is in flight', () => {
    mockSendIsPending = true
    renderChatPanel({ selectedVolunteerId: 'vol-1' })

    expect(screen.getByLabelText('detail.chat.send')).toBeDisabled()
  })

  it('shows a send-failed message when the mutation errors', () => {
    mockSendIsError = true
    renderChatPanel({ selectedVolunteerId: 'vol-1' })

    expect(screen.getByText('detail.chat.sendFailed')).toBeInTheDocument()
  })

  it('shows a load-failed message when messages fail to fetch', () => {
    renderChatPanel({ isMessagesError: true })
    expect(screen.getByText('detail.chat.loadFailed')).toBeInTheDocument()
  })

  it('shows a read-only state instead of a composer for a volunteer who was removed', () => {
    renderChatPanel({
      volunteers: [approvedVolunteer({ status: 'removed' })],
      selectedVolunteerId: 'vol-1',
      messages: [message({ text: 'Last thing they said' })],
    })

    expect(screen.getByText('Last thing they said')).toBeInTheDocument()
    expect(screen.getAllByText('detail.chat.volunteerRemoved').length).toBeGreaterThan(0)
    expect(screen.queryByPlaceholderText(/detail.chat.placeholderTo/)).not.toBeInTheDocument()
  })
})
