import {
  applyEnqueue,
  classifyFlushFailure,
  markSegmentKey,
  pendingActions,
  sortByCreatedAt,
  type OutboxAction,
} from './outbox-policy';

function markSegmentAction(overrides: Partial<OutboxAction> = {}): OutboxAction {
  return {
    id: 'action-1',
    type: 'mark_segment',
    key: markSegmentKey(3),
    payload: { segmentId: 3, status: 'searched', occurredAt: '2026-08-21T10:00:00Z', generationId: 'gen-1' },
    status: 'pending',
    failureReason: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function remarkAction(overrides: Partial<OutboxAction> = {}): OutboxAction {
  return {
    id: 'remark-1',
    type: 'remark',
    key: 'remark-1',
    payload: { kind: 'hazard', reportedAt: '2026-08-21T10:00:00Z' },
    status: 'pending',
    failureReason: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('applyEnqueue', () => {
  it('appends a new action to an empty queue', () => {
    const action = markSegmentAction();
    expect(applyEnqueue([], action)).toEqual([action]);
  });

  it('a new mark_segment action for the same segment replaces the existing pending one', () => {
    const first = markSegmentAction({ id: 'a', status: 'pending' });
    const second = markSegmentAction({ id: 'b', createdAt: 2000 });

    const result = applyEnqueue([first], second);

    expect(result).toEqual([second]);
  });

  it('replaces even a failed_permanent row for the same segment — a fresh tap supersedes a stale failure', () => {
    const failed = markSegmentAction({ id: 'a', status: 'failed_permanent', failureReason: 'Locked' });
    const retry = markSegmentAction({ id: 'b', createdAt: 2000 });

    const result = applyEnqueue([failed], retry);

    expect(result).toEqual([retry]);
  });

  it('never coalesces remark actions — each keeps its own unique key', () => {
    const first = remarkAction({ id: 'r1', key: 'r1' });
    const second = remarkAction({ id: 'r2', key: 'r2', createdAt: 2000 });

    const result = applyEnqueue([first], second);

    expect(result).toEqual([first, second]);
  });

  it('does not disturb a different segment_id already in the queue', () => {
    const segmentThree = markSegmentAction({ key: markSegmentKey(3) });
    const segmentFive = markSegmentAction({ id: 'c', key: markSegmentKey(5), createdAt: 2000 });

    const result = applyEnqueue([segmentThree], segmentFive);

    expect(result).toEqual([segmentThree, segmentFive]);
  });
});

describe('sortByCreatedAt / pendingActions', () => {
  it('sorts strictly by createdAt ascending, regardless of input order', () => {
    const late = markSegmentAction({ id: 'late', createdAt: 3000 });
    const early = markSegmentAction({ id: 'early', createdAt: 1000 });
    const mid = markSegmentAction({ id: 'mid', createdAt: 2000 });

    const result = sortByCreatedAt([late, early, mid]);

    expect(result.map((a) => a.id)).toEqual(['early', 'mid', 'late']);
  });

  it('pendingActions excludes failed_permanent rows and sorts what remains', () => {
    const failed = markSegmentAction({ id: 'failed', status: 'failed_permanent', createdAt: 500 });
    const retryable = markSegmentAction({ id: 'retryable', status: 'retryable', createdAt: 2000 });
    const pending = markSegmentAction({ id: 'pending', status: 'pending', createdAt: 1000 });

    const result = pendingActions([failed, retryable, pending]);

    expect(result.map((a) => a.id)).toEqual(['pending', 'retryable']);
  });
});

describe('classifyFlushFailure', () => {
  it('classifies a network/timeout failure as retryable', () => {
    expect(classifyFlushFailure({ kind: 'network' })).toEqual({
      status: 'retryable',
      reason: 'No connection — will retry automatically.',
    });
  });

  it('classifies a 5xx as retryable', () => {
    const result = classifyFlushFailure({ kind: 'http', status: 503 });
    expect(result.status).toBe('retryable');
  });

  it('classifies a 401 as failed_permanent with a sign-in-again reason', () => {
    const result = classifyFlushFailure({ kind: 'http', status: 401 });
    expect(result.status).toBe('failed_permanent');
    expect(result.reason).toMatch(/sign in/i);
  });

  it('classifies a 404 as failed_permanent', () => {
    expect(classifyFlushFailure({ kind: 'http', status: 404 }).status).toBe('failed_permanent');
  });

  it('classifies a 409 segment-locked error as failed_permanent with a locked reason', () => {
    const result = classifyFlushFailure({
      kind: 'http',
      status: 409,
      errors: { segment: ['locked'] },
    });
    expect(result.status).toBe('failed_permanent');
    expect(result.reason).toMatch(/locked/i);
  });

  it('classifies a 409 stale-generation error as failed_permanent with a distinct reason', () => {
    const result = classifyFlushFailure({
      kind: 'http',
      status: 409,
      errors: { generation: ['stale'] },
    });
    expect(result.status).toBe('failed_permanent');
    expect(result.reason).toMatch(/search area changed/i);
  });

  it('classifies an unrecognized 422 (validation) as failed_permanent — retrying an invalid request never succeeds', () => {
    expect(classifyFlushFailure({ kind: 'http', status: 422 }).status).toBe('failed_permanent');
  });
});
