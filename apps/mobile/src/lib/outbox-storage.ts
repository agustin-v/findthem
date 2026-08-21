import { getDb } from '@/lib/offline-db';
import type { OutboxAction, OutboxActionStatus, OutboxPayload } from '@/lib/outbox-policy';

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

function rowToAction(row: OutboxRow): OutboxAction {
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
}

// Best-effort, like every other offline-cache read in this app — a
// corrupt row or a native-module error means "empty queue" rather than a
// thrown error blocking whatever screen is trying to read it.
export async function getAllActions(): Promise<OutboxAction[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<OutboxRow>('SELECT * FROM outbox_actions');
    return rows.map(rowToAction);
  } catch {
    return [];
  }
}

// Coalescing (applyEnqueue in outbox-policy.ts) has already decided which
// existing row(s) to remove — this just persists that decision as one
// delete-then-insert, inside a transaction so a crash mid-write can't
// leave both the superseded and the new row on disk at once.
export async function replaceActionsForKey(key: string, action: OutboxAction): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM outbox_actions WHERE key = ?', key);
    await db.runAsync(
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
