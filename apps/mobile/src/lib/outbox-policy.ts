// Pure logic only — no react-native/expo-sqlite imports — so this stays
// importable from vitest, same split as chat-read-state.ts/
// chat-read-storage.ts and offline-cache.ts/offline-cache-policy.ts. The
// actual storage adapter (outbox-storage.ts) and network orchestration
// (outbox.ts) are native-heavy/side-effecting and untested, matching that
// precedent — everything that's actually worth unit-testing (ordering,
// coalescing, retry classification) lives here instead.
import type { SegmentStatus } from './segments';
import type { RemarkKind } from './api';

export type OutboxActionType = 'mark_segment' | 'remark' | 'message';
export type OutboxActionStatus = 'pending' | 'retryable' | 'failed_permanent';

export interface MarkSegmentPayload {
  segmentId: number;
  status: SegmentStatus;
  occurredAt: string;
  generationId: string | null;
}

export interface RemarkPayload {
  kind: RemarkKind;
  text?: string;
  lat?: number;
  lng?: number;
  reportedAt: string;
}

export interface MessagePayload {
  text: string;
  sentAt: string;
}

export type OutboxPayload = MarkSegmentPayload | RemarkPayload | MessagePayload;

export interface OutboxAction {
  id: string;
  type: OutboxActionType;
  // The coalescing dimension — segment_id for mark_segment (so a fresh
  // status enqueue supersedes an existing queued one for the *same*
  // segment); the action's own id for remark/message, which already have
  // a correct, replay-safe client UUID per action and are never coalesced.
  key: string;
  payload: OutboxPayload;
  status: OutboxActionStatus;
  failureReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export function markSegmentKey(segmentId: number): string {
  return `mark_segment:${segmentId}`;
}

// Enqueueing a new mark_segment action for a segment_id already in the
// queue *replaces* it, regardless of that existing row's status —
// including a failed_permanent one, since the volunteer tapping the
// segment again is a fresh attempt that should supersede a stale failure,
// not sit alongside it. A fresh id per action (rather than reusing the
// queue slot's own id) would let an out-of-order replay of a stale
// "in_progress" land after a "searched" and silently null searched_at
// (the backend's own put_searched_at/3 behavior) — coalescing at enqueue
// time removes the superseded action instead of ever sending it.
//
// remark/message actions never coalesce — their key is always their own
// unique id, so this always appends for those types.
export function applyEnqueue(queue: OutboxAction[], action: OutboxAction): OutboxAction[] {
  return [...queue.filter((existing) => existing.key !== action.key), action];
}

// FIFO — the order actions were enqueued is the order they're sent, so a
// mark_segment coalesced replacement (which gets a fresh createdAt) is
// correctly resent at the *end* of the queue, not silently retained at its
// original position.
export function sortByCreatedAt(queue: OutboxAction[]): OutboxAction[] {
  return [...queue].sort((a, b) => a.createdAt - b.createdAt);
}

export function pendingActions(queue: OutboxAction[]): OutboxAction[] {
  return sortByCreatedAt(queue.filter((a) => a.status === 'pending' || a.status === 'retryable'));
}

// The orchestration layer (outbox.ts) converts whatever it actually caught
// (an ApiError instance, a network/timeout failure, anything else) into
// this plain shape before calling classifyFlushFailure — keeping this
// module decoupled from api.ts's ApiError class entirely, so it can be
// tested with plain object literals.
export interface FlushFailure {
  kind: 'http' | 'network';
  status?: number;
  errors?: Record<string, string[]>;
}

export interface FlushClassification {
  status: 'retryable' | 'failed_permanent';
  reason: string;
}

// Two distinct terminal states, not one `failed` bucket — retryable
// (timeout/5xx) stays queued for the next flush trigger; failed_permanent
// (409 locked, 409 stale-generation, 404, 401) is never auto-retried and
// surfaced to the volunteer with a reason instead. A single `failed`
// status that gets re-picked-up by the same "process pending" loop would
// retry a terminally-rejected action forever.
export function classifyFlushFailure(failure: FlushFailure): FlushClassification {
  if (failure.kind === 'network') {
    return { status: 'retryable', reason: 'No connection — will retry automatically.' };
  }

  switch (failure.status) {
    case 401:
      return { status: 'failed_permanent', reason: 'Sign in again to send this.' };
    case 404:
      return { status: 'failed_permanent', reason: 'This is no longer available.' };
    case 409:
      if (failure.errors?.segment) {
        return { status: 'failed_permanent', reason: 'Locked for another volunteer.' };
      }
      if (failure.errors?.generation) {
        return {
          status: 'failed_permanent',
          reason: 'The search area changed since this was queued.',
        };
      }
      return { status: 'failed_permanent', reason: 'This was rejected.' };
    case 429:
      // Rate-limited, not rejected — inherently transient (unlike a
      // generic 4xx below), the same request will very likely succeed
      // once the window resets. No endpoint the outbox currently uses is
      // rate-limited (only /volunteer/location is), but classifying this
      // correctly now avoids a silent regression the moment one is.
      return { status: 'retryable', reason: 'Sending too fast — will retry automatically.' };
    default:
      if (failure.status != null && failure.status >= 500) {
        return { status: 'retryable', reason: 'Server error — will retry automatically.' };
      }
      // Any other 4xx (422 validation, etc.) won't succeed by retrying —
      // the request itself is wrong, not the connection.
      return { status: 'failed_permanent', reason: 'This was rejected.' };
  }
}
