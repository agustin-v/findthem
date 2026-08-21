import { getDb } from '@/lib/offline-db';
import type { OutboxAction, OutboxActionStatus, OutboxActionType, OutboxPayload } from '@/lib/outbox-policy';

// Split from outbox.ts (the public enqueue/flush API) the same way
// offline-cache.ts is split from offline-db.ts — this is the thin,
// native-heavy, untested storage adapter; outbox-policy.ts is where the
// actual queue logic (coalescing, ordering, retry classification) lives,
// tested under vitest.

interface OutboxRow {
  id: string;
  key: string;
  type: string;
  payload: string;
  status: string;
  failure_reason: string | null;
  created_at: number;
  updated_at: number;
}

const VALID_TYPES: OutboxActionType[] = ['mark_segment', 'remark', 'message'];
const VALID_STATUSES: OutboxActionStatus[] = ['pending', 'retryable', 'failed_permanent'];

// Validates rather than blindly casting a DB value — a corrupted row, or
// one written by some future schema version this build predates, must be
// dropped here rather than handed to outbox.ts's sendAction with an
// unrecognized type, which would otherwise fall through its switch
// statement and (before this check existed) be treated as a silent
// success, permanently discarding the action without ever attempting it.
function rowToAction(row: OutboxRow): OutboxAction | null {
  if (!VALID_TYPES.includes(row.type as OutboxActionType)) return null;
  if (!VALID_STATUSES.includes(row.status as OutboxActionStatus)) return null;

  try {
    return {
      id: row.id,
      key: row.key,
      type: row.type as OutboxAction['type'],
      payload: JSON.parse(row.payload) as OutboxPayload,
      status: row.status as OutboxActionStatus,
      failureReason: row.failure_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

// Best-effort, like every other offline-cache read in this app — a
// corrupt row or a native-module error means "empty queue" rather than a
// thrown error blocking whatever screen is trying to read it.
export async function getAllActions(): Promise<OutboxAction[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<OutboxRow>('SELECT * FROM outbox_actions');
    return rows.map(rowToAction).filter((a): a is OutboxAction => a != null);
  } catch {
    return [];
  }
}

// Coalescing (applyEnqueue in outbox-policy.ts) has already decided which
// existing row(s) to remove — this just persists that decision as one
// delete-then-insert. withExclusiveTransactionAsync, not the plain
// (non-exclusive) variant — expo-sqlite only guarantees isolation from
// other concurrent operations on this connection with the exclusive form;
// the plain form only guarantees the delete+insert pair itself can't be
// torn by a crash, not that a concurrent getAllActions() (from
// flushOutbox's own snapshot read) can't observe an in-between state.
export async function replaceActionsForKey(key: string, action: OutboxAction): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM outbox_actions WHERE key = ?', key);
    await txn.runAsync(
      `INSERT INTO outbox_actions (id, key, type, payload, status, failure_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      action.id,
      action.key,
      action.type,
      JSON.stringify(action.payload),
      action.status,
      action.failureReason,
      action.createdAt,
      action.updatedAt,
    );
  });
}

export async function updateActionStatus(
  id: string,
  status: OutboxActionStatus,
  failureReason: string | null,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE outbox_actions SET status = ?, failure_reason = ?, updated_at = ? WHERE id = ?',
    status,
    failureReason,
    Date.now(),
    id,
  );
}

export async function removeAction(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM outbox_actions WHERE id = ?', id);
}
