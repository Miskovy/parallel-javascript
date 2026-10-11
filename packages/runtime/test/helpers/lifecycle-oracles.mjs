import assert from 'node:assert/strict';
import { assertOwners } from './containment.mjs';
import { INVARIANTS } from './lifecycle-model.mjs';

export class Divergence extends Error {
  constructor(invariant, detail, cause) {
    super(invariant + ': ' + detail, { cause });
    this.invariant = invariant;
    this.property = invariant + ':' + detail;
  }
}
export function compare(expected, actual) {
  const check = (id, field) => {
    try {
      assert.deepEqual(actual[field], expected[field]);
    } catch (cause) {
      throw new Divergence(id, field, cause);
    }
  };
  check('I8', 'state');
  check('I8', 'drain');
  check('I8', 'shutdownOutcome');
  check('I5', 'queue');
  check('I3', 'logicalMetrics');
  if (actual.livePopulation > actual.poolLimit)
    throw new Divergence('I2', 'physical population exceeds pool');
  for (const t of actual.tasks)
    if (t.settlements > 1)
      throw new Divergence('I3', 'duplicate settlement ' + t.id);
  for (const w of expected.workers) {
    const seen = actual.workers.find((x) => x.id === w.id);
    if (w.ids.length && !seen?.ids.length)
      throw new Divergence('I1', 'early physical completion');
  }
  check('I1', 'workers');
  const logical = (t) => ({
    id: t.id,
    status: t.status,
    outcome: t.outcome,
    error: t.error,
    settlements: t.settlements,
  });
  try {
    assert.deepEqual(actual.tasks?.map(logical), expected.tasks?.map(logical));
  } catch (cause) {
    throw new Divergence('I3', 'logical tasks', cause);
  }
  try {
    assert.deepEqual(
      actual.tasks?.map(({ id, credit, mode }) => ({ id, credit, mode })),
      expected.tasks?.map(({ id, credit, mode }) => ({ id, credit, mode })),
    );
  } catch (cause) {
    throw new Divergence('I4', 'result-credit owners', cause);
  }
  check('I9', 'posts');
  check('I9', 'dispatches');
  for (const field of [
    'failures',
    'restarts',
    'replacements',
    'exhaustions',
    'utilization',
  ])
    check('I6', field);
  for (const field of ['leaseExpirations', 'leaseRequests', 'leaseExits'])
    check('I7', field);
  check('I8', 'escalations');
  check('I4', 'refunded');
  check('I4', 'reconciled');
  check('I4', 'streams');
  return INVARIANTS.filter((id) => id !== 'I10');
}
export function inspect(runtime, controller, quiescent = false) {
  try {
    assertOwners(runtime, { quiescent });
    const credits = runtime.resultCredits;
    const sum = [...credits.reservations.values()].reduce(
      (n, r) => n + r.creditedBytes,
      0,
    );
    assert.ok(sum >= 0);
    assert.equal(sum, runtime.stats().streamResults.currentReservedResultBytes);
    assert.equal(
      sum,
      [...credits.operations.values()].reduce((n, r) => n + r.bytes, 0),
    );
    for (const r of credits.reservations.values()) {
      assert.ok(
        controller.rawToAlias.has(r.taskId),
        'reservation owner is known',
      );
      assert.ok(r.creditedBytes >= 0 && r.creditedBytes <= r.bytes);
      if (r.reconciled) assert.ok(r.executionDone && r.mode === 'upper-bound');
    }
    assert.equal(runtime.dispatcher.admissionReservations, 0);
    assert.equal(runtime.dispatcher.reservedWorkers.size, 0);
    if (quiescent) {
      assert.equal(runtime.rangeCoordinator.size, 0);
      assert.equal(runtime.rangeCoordinator.productionTick, undefined);
      assert.equal(runtime.shutdownTimer, undefined);
      assert.equal(runtime.dispatcher.pool.repairs.size, 0);
      for (const c of controller.controls.values()) {
        assert.ok(c.exit.confirmed, 'test-owned worker exited');
        assert.equal(c.worker.lease, undefined);
        assert.equal(c.time.timers.filter((t) => !t.cancelled).length, 0);
        assert.equal(c.worker.thread.eventNames().length, 0);
      }
      for (const record of controller.records.values()) {
        assert.equal(record.listeners(), 0);
        assert.equal(record.pending.input, undefined);
        assert.equal(record.pending.transferList.length, 0);
      }
      for (const stream of controller.streams.values()) {
        assert.equal(stream.buffered, 0);
        assert.equal(stream.waiter, undefined);
        assert.equal(stream.callbacks, undefined);
      }
      assert.equal(
        controller.shutdownTime.timers.filter((t) => !t.cancelled).length,
        0,
      );
      assert.equal(controller.unhandled.length, 0);
    }
  } catch (cause) {
    throw new Divergence(
      quiescent ? 'I10' : 'I4',
      'cross-component scan',
      cause,
    );
  }
}
