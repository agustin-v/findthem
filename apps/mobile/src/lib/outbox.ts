import * as Crypto from 'expo-crypto';

import {
  ApiError,
  createRemark,
  sendVolunteerMessage,
  updateSegmentStatus,
  type Message,
  type Remark,
  type SendMessagePayload,
  type VolunteerSegment,
} from '@/lib/api';
import { getVolunteerToken } from '@/lib/token';
import {
  classifyFlushFailure,
  markSegmentKey,
  pendingActions,
  type FlushFailure,
  type MarkSegmentPayload,
  type MessagePayload,
  type OutboxAction,
  type RemarkPayload,
} from '@/lib/outbox-policy';
import { getAllActions, removeAction, replaceActionsForKey, updateActionStatus } from '@/lib/outbox-storage';

// The public API every write action a volunteer can trigger goes through
// (segment status, remark, chat message — not location pings, deliberately
// out of scope: no client id for offline replay safety, and it would trip
// the existing per-volunteer rate limit on a bulk flush). Orchestrates
// outbox-policy.ts (the pure decisions) and outbox-storage.ts (the actual
// persistence) with the real network calls, none of which belong in
// either of those.

export interface FlushOutcome {
  action: OutboxAction;
  outcome: 'sent' | 'retryable' | 'failed_permanent';
  reason: string | null;
  // Only set when outcome is 'sent' — the real server response, typed by
  // action.type. Callers use this to reconcile their own optimistic guess
  // (e.g. a client-computed occurredAt) with what the server actually
  // persisted (server-clamped, lock state resolved, etc.) rather than
  // trusting the guess forever.
  result?: VolunteerSegment | Remark | Message;
  // True specifically when failed_permanent stems from a 401 (or no token
  // at all) — distinct from the generic reason string so a caller (e.g.
  // chat.tsx's handleAuthExpired) can react to "this volunteer's session
  // is actually gone" without pattern-matching a human-readable message.
  authExpired?: boolean;
}

function now() {
  return Date.now();
}

async function persistEnqueue(
  type: OutboxAction['type'],
  key: string,
  payload: OutboxAction['payload'],
): Promise<OutboxAction> {
  const timestamp = now();
  const action: OutboxAction = {
    id: Crypto.randomUUID(),
    type,
    key,
    payload,
    status: 'pending',
    failureReason: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // Persists directly via the storage adapter (delete-by-key then insert)
  // rather than computing outbox-policy.ts's applyEnqueue() over an
  // in-memory copy of the whole table first — same coalescing semantics,
  // without a redundant read.
  await replaceActionsForKey(key, action);
  return action;
}

// Enqueues durably, then immediately attempts to send it (this is what
// makes the "online, tap a button" path behave the same as it always
// did — a real request is always attempted right away; enqueueing is
// what makes that attempt survive a failure instead of just erroring out).
// Callers apply their own optimistic UI update *before* calling this, and
// roll it back if the resolved outcome is failed_permanent.
export async function enqueueMarkSegment(payload: MarkSegmentPayload): Promise<FlushOutcome> {
  const action = await persistEnqueue('mark_segment', markSegmentKey(payload.segmentId), payload);
  return attemptFlush(action);
}

export async function enqueueRemark(payload: RemarkPayload & { id?: string }): Promise<FlushOutcome> {
  const id = payload.id ?? Crypto.randomUUID();
  const { id: _drop, ...rest } = payload;
  const action = await persistEnqueue('remark', id, rest);
  // The remark's own id must match the queued action's id — createRemark
  // is idempotent on it (server on_conflict: :nothing), so reusing the
  // action id as the remark id is what makes a retried flush safe.
  return attemptFlush({ ...action, id });
}

export async function enqueueMessage(payload: MessagePayload & { id?: string }): Promise<FlushOutcome> {
  const id = payload.id ?? Crypto.randomUUID();
  const { id: _drop, ...rest } = payload;
  const action = await persistEnqueue('message', id, rest);
  return attemptFlush({ ...action, id });
}

async function sendAction(
  action: OutboxAction,
  token: string,
): Promise<VolunteerSegment | Remark | Message> {
  switch (action.type) {
    case 'mark_segment': {
      const payload = action.payload as MarkSegmentPayload;
      return updateSegmentStatus(token, payload.segmentId, payload.status, {
        occurredAt: payload.occurredAt,
        generationId: payload.generationId ?? undefined,
      });
    }
    case 'remark': {
      const payload = action.payload as RemarkPayload;
      return createRemark(token, { id: action.id, ...payload });
    }
    case 'message': {
      const payload = action.payload as MessagePayload;
      const body: SendMessagePayload = { id: action.id, text: payload.text, sentAt: payload.sentAt };
      return sendVolunteerMessage(token, body);
    }
  }
}

function toFlushFailure(error: unknown): FlushFailure {
  if (error instanceof ApiError) {
    return { kind: 'http', status: error.status, errors: error.errors };
  }
  return { kind: 'network' };
}

// Token read fresh from SecureStore on every attempt, never persisted
// inside an outbox row — a stale token cached alongside a queued action
// would let a *different* identity's later flush (a different volunteer
// signed in on the same device after a reset) silently pick it up. If
// there's no token at all (never signed in, or resetOfflineStore already
// ran), this action simply can't be sent — classified the same way an
// expired token bounced by the server would be.
async function attemptFlush(action: OutboxAction): Promise<FlushOutcome> {
  const token = await getVolunteerToken();
  if (!token) {
    const reason = 'Sign in again to send this.';
    await updateActionStatus(action.id, 'failed_permanent', reason);
    return {
      action: { ...action, status: 'failed_permanent', failureReason: reason },
      outcome: 'failed_permanent',
      reason,
      authExpired: true,
    };
  }

  try {
    const result = await sendAction(action, token);
    await removeAction(action.id);
    return { action, outcome: 'sent', reason: null, result };
  } catch (error) {
    const failure = toFlushFailure(error);
    const classification = classifyFlushFailure(failure);
    await updateActionStatus(action.id, classification.status, classification.reason);
    return {
      action: { ...action, status: classification.status, failureReason: classification.reason },
      outcome: classification.status,
      reason: classification.reason,
      authExpired: failure.status === 401,
    };
  }
}

// Drains every pending/retryable action in enqueue order — called on a
// NetInfo online transition, an AppState foreground event, and a manual
// pull-to-refresh (map.tsx wires all three; none of them is a hard
// dependency, same "wake up sooner" philosophy as the socket-triggered
// refreshes elsewhere in this app — the next trigger just tries again).
// Serial, not parallel, and stops at the first *retryable* (network-shaped)
// failure — the rest are overwhelmingly likely to fail the same way, and
// retrying immediately in a loop just burns battery/data for nothing; the
// next trigger will pick up where this left off. A failed_permanent result
// is action-specific (a locked segment, say) and does NOT stop the drain —
// unrelated queued actions still deserve their own attempt.
export async function flushOutbox(): Promise<FlushOutcome[]> {
  const queue = pendingActions(await getAllActions());
  const results: FlushOutcome[] = [];

  for (const action of queue) {
    const result = await attemptFlush(action);
    results.push(result);
    if (result.outcome === 'retryable') break;
  }

  return results;
}

export async function getQueuedActions(): Promise<OutboxAction[]> {
  return getAllActions();
}

export type { OutboxAction } from '@/lib/outbox-policy';
