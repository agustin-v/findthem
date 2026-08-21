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
import { getGeneration } from '@/lib/offline-db';
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

// Chains attempts for the *same key* so two enqueue calls close together
// (e.g. a volunteer tapping "in progress" then "searched" on one segment
// before the first request has even returned) hit the network in the
// order they were enqueued, not in whichever order their responses happen
// to arrive. Without this, a slow first response landing after a fast
// second one would leave the server showing the *earlier* status —
// coalescing the local queue row alone doesn't prevent an already-issued
// request for the superseded value from still completing. Different keys
// (different segments, or any remark/message — each its own unique key)
// run fully concurrently; this only serializes repeats of the same key.
const inFlightByKey = new Map<string, Promise<FlushOutcome>>();

function runSerialized(key: string, action: OutboxAction): Promise<FlushOutcome> {
  const previous = inFlightByKey.get(key) ?? Promise.resolve();
  const runNext = previous.catch(() => {}).then(() => attemptFlush(action));
  inFlightByKey.set(key, runNext);
  runNext.finally(() => {
    if (inFlightByKey.get(key) === runNext) inFlightByKey.delete(key);
  });
  return runNext;
}

// Enqueues durably, then immediately attempts to send it (this is what
// makes the "online, tap a button" path behave the same as it always
// did — a real request is always attempted right away; enqueueing is
// what makes that attempt survive a failure instead of just erroring out).
// Callers apply their own optimistic UI update *before* calling this, and
// roll it back if the resolved outcome is failed_permanent — but only if
// their own attempt is still the most recent one for that key (see
// map.tsx's own per-segment sequence guard: this function's serialization
// guarantees correct *network* ordering, not which caller's reconciliation
// logic runs last, since an earlier call's promise can still resolve and
// be awaited after a later call has already applied newer optimistic
// state).
export async function enqueueMarkSegment(payload: MarkSegmentPayload): Promise<FlushOutcome> {
  const key = markSegmentKey(payload.segmentId);
  const action = await persistEnqueue('mark_segment', key, payload);
  return runSerialized(key, action);
}

export async function enqueueRemark(payload: RemarkPayload & { id?: string }): Promise<FlushOutcome> {
  const id = payload.id ?? Crypto.randomUUID();
  const { id: _drop, ...rest } = payload;
  const action = await persistEnqueue('remark', id, rest);
  // The remark's own id must match the queued action's id — createRemark
  // is idempotent on it (server on_conflict: :nothing), so reusing the
  // action id as the remark id is what makes a retried flush safe.
  return runSerialized(id, { ...action, id });
}

export async function enqueueMessage(payload: MessagePayload & { id?: string }): Promise<FlushOutcome> {
  const id = payload.id ?? Crypto.randomUUID();
  const { id: _drop, ...rest } = payload;
  const action = await persistEnqueue('message', id, rest);
  return runSerialized(id, { ...action, id });
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
    default: {
      // Exhaustiveness is only a compile-time guarantee — a corrupted
      // outbox_actions.type value (e.g. from a future schema this build
      // predates) must not silently fall through and be treated as a
      // successful send by the caller, permanently discarding a queued
      // action without ever attempting it.
      const unreachable: never = action.type;
      throw new Error(`Unknown outbox action type: ${String(unreachable)}`);
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
// signed in on the same device after a reset) silently pick it up.
async function attemptFlush(action: OutboxAction): Promise<FlushOutcome> {
  // Captured before the (async, yield-to-event-loop) token read below —
  // see resetOfflineStore's own reasoning in offline-db.ts. If a reset
  // (an identity boundary: sign-out, or a *different* volunteer signing
  // in on this device) lands in the gap between this attempt starting and
  // the token read resolving, sending now would attach this action's
  // payload — queued under the *previous* identity — to whatever session
  // just started, landing it in a different volunteer's search. Abort
  // rather than risk that; the row itself is likely already gone (reset
  // wipes the whole database) so there's nothing meaningful to update in
  // storage either.
  const generationAtStart = getGeneration();

  let token: string | null;
  try {
    token = await getVolunteerToken();
  } catch {
    // A genuine SecureStore/Keychain failure — not a definitive "this
    // action can't be sent", just "couldn't check right now". Retryable
    // so it's picked up again on the next trigger rather than being
    // permanently abandoned or crashing the caller.
    return { action, outcome: 'retryable', reason: null };
  }

  if (getGeneration() !== generationAtStart) {
    return { action, outcome: 'retryable', reason: null };
  }

  if (!token) {
    const reason = 'Sign in again to send this.';
    await updateActionStatus(action.id, 'failed_permanent', reason).catch(() => {});
    return {
      action: { ...action, status: 'failed_permanent', failureReason: reason },
      outcome: 'failed_permanent',
      reason,
      authExpired: true,
    };
  }

  // Re-verify against storage — this action may have been coalesced away
  // (a fresher enqueue for the same key) since whatever snapshot led to
  // this call was read, especially in flushOutbox's batch path. Sending a
  // stale, already-superseded payload would both waste a request and
  // reintroduce the out-of-order-write problem coalescing exists to
  // prevent — runSerialized's per-key chaining only orders *this* call
  // relative to others for the same key, it doesn't know a batch flush
  // handed it a snapshot that's since gone stale.
  const stillQueued = (await getAllActions()).some((a) => a.id === action.id);
  if (!stillQueued) {
    return { action, outcome: 'retryable', reason: null };
  }

  try {
    const result = await sendAction(action, token);
    await removeAction(action.id);
    return { action, outcome: 'sent', reason: null, result };
  } catch (error) {
    const failure = toFlushFailure(error);
    const classification = classifyFlushFailure(failure);
    await updateActionStatus(action.id, classification.status, classification.reason).catch(() => {});
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
// Serial, not parallel, and never stops early — an earlier draft of this
// function stopped at the first retryable (network-shaped) failure on the
// reasoning that everything behind it would fail the same way, but that
// also meant one deterministically-failing action (a real backend
// rejection that happens to classify as retryable, or simply landing
// first in an unlucky order) could wedge every other queued action behind
// it forever, on every future trigger, since FIFO always tries the same
// one first. Processing the whole queue every time costs at most a few
// wasted timeouts while genuinely offline — cheap compared to a
// volunteer's real report silently never sending.
let flushInProgress: Promise<FlushOutcome[]> | null = null;

export function flushOutbox(): Promise<FlushOutcome[]> {
  // Reentrancy guard — the three sync triggers in map.tsx (NetInfo
  // transition, AppState foreground, cold-start) can fire within the same
  // tick of each other (e.g. at app launch), and without this they'd each
  // start their own overlapping pass over the same snapshot.
  if (flushInProgress) return flushInProgress;

  flushInProgress = (async () => {
    const queue = pendingActions(await getAllActions());
    const results: FlushOutcome[] = [];

    for (const action of queue) {
      try {
        results.push(await runSerialized(action.key, action));
      } catch {
        // attemptFlush itself is designed not to throw (every branch
        // returns a FlushOutcome), but the storage calls it awaits can
        // still reject on a genuine native-module failure — one action's
        // unexpected error must not abort every action still queued
        // behind it.
        results.push({ action, outcome: 'retryable', reason: null });
      }
    }

    return results;
  })();

  return flushInProgress.finally(() => {
    flushInProgress = null;
  });
}

export async function getQueuedActions(): Promise<OutboxAction[]> {
  return getAllActions();
}

export type { OutboxAction } from '@/lib/outbox-policy';
