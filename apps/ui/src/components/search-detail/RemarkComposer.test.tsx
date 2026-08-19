import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RemarkComposer } from './RemarkComposer'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const mockMutate = vi.fn()
let mockIsPending = false
let mockIsError = false
vi.mock('@/hooks/useSearches', () => ({
  useCreateRemark: () => ({ mutate: mockMutate, isPending: mockIsPending, isError: mockIsError }),
}))

describe('RemarkComposer', () => {
  beforeEach(() => {
    mockMutate.mockReset()
    mockIsPending = false
    mockIsError = false
  })

  it('defaults to the hazard kind', () => {
    render(
      <RemarkComposer searchId="search-1" location={{ lat: 41.9, lng: 12.5 }} onClose={vi.fn()} />,
    )
    expect(screen.getByText('detail.remarks.kind.hazard')).toBeInTheDocument()
  })

  it('posting submits the picked location, kind, and trimmed text', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <RemarkComposer searchId="search-1" location={{ lat: 41.9, lng: 12.5 }} onClose={onClose} />,
    )

    await user.type(
      screen.getByPlaceholderText('detail.remarks.textPlaceholder'),
      '  Bridge is down  ',
    )
    await user.click(screen.getByText('detail.remarks.post'))

    expect(mockMutate).toHaveBeenCalledWith(
      { kind: 'hazard', text: 'Bridge is down', lat: 41.9, lng: 12.5 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('posts undefined text when the field is left blank', async () => {
    const user = userEvent.setup()
    render(
      <RemarkComposer searchId="search-1" location={{ lat: 41.9, lng: 12.5 }} onClose={vi.fn()} />,
    )

    await user.click(screen.getByText('detail.remarks.post'))

    expect(mockMutate).toHaveBeenCalledWith(
      { kind: 'hazard', text: undefined, lat: 41.9, lng: 12.5 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('calling onClose is wired to the mutation onSuccess callback', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <RemarkComposer searchId="search-1" location={{ lat: 41.9, lng: 12.5 }} onClose={onClose} />,
    )

    await user.click(screen.getByText('detail.remarks.post'))

    const options = mockMutate.mock.calls[0][1] as { onSuccess: () => void }
    options.onSuccess()
    expect(onClose).toHaveBeenCalled()
  })

  it('disables the post button while a post is in flight', () => {
    mockIsPending = true
    render(
      <RemarkComposer searchId="search-1" location={{ lat: 41.9, lng: 12.5 }} onClose={vi.fn()} />,
    )
    expect(screen.getByText('detail.remarks.post')).toBeDisabled()
  })

  it('shows a post-failed message when the mutation errors', () => {
    mockIsError = true
    render(
      <RemarkComposer searchId="search-1" location={{ lat: 41.9, lng: 12.5 }} onClose={vi.fn()} />,
    )
    expect(screen.getByText('detail.remarks.postFailed')).toBeInTheDocument()
  })

  it('the cancel button and header close button both call onClose without posting', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <RemarkComposer searchId="search-1" location={{ lat: 41.9, lng: 12.5 }} onClose={onClose} />,
    )

    await user.click(screen.getByText('detail.remarks.cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByLabelText('detail.remarks.cancel'))
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(mockMutate).not.toHaveBeenCalled()
  })
})
