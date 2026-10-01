import assert from 'node:assert/strict';
import test from 'node:test';
import { PjsResultCapacityError } from '../dist/errors/index.js';
import { ResultCreditManager } from '../dist/results/credit.js';

function operation(id, capacity = 16) {
  return { id, resultByteCapacity: capacity };
}

function reserve(manager, owner, taskId, partitionIndex, bytes = 4, mode) {
  manager.reserve(
    taskId,
    owner,
    partitionIndex,
    bytes,
    {
      operationId: owner.id,
      partitionIndex,
      rangeStart: partitionIndex,
      rangeEnd: partitionIndex + 1,
    },
    mode,
  );
}

test('upper-bound reconciliation refunds immediately and yield releases actual credit', () => {
  const manager = new ResultCreditManager();
  const owner = operation('refund', 8);
  reserve(manager, owner, 'a', 0, 8, 'upper-bound');
  manager.markDispatched('a', ['a']);
  manager.reconcile('a', 3);
  assert.equal(manager.reserved(owner), 3);
  assert.equal(manager.canReserve(owner, 5), true);
  assert.equal(manager.snapshot().refundedResultBytes, 5);
  assert.equal(manager.snapshot().resultByteRefunds, 1);
  manager.reconcile('a', 1);
  assert.equal(manager.reserved(owner), 3);
  manager.markExecutionEnded('a');
  manager.releaseForPartition(owner, 0);
  assert.equal(manager.reserved(owner), 0);
  assert.equal(manager.snapshot().refundedResultBytes, 5);
  manager.reconcile('a', 0);
  manager.reconcile('unknown', 0);
  assert.equal(manager.snapshot().upperBoundResultsReconciled, 1);
});

test('upper-bound zero and equal actuals reconcile independently in a batch', () => {
  const manager = new ResultCreditManager();
  const owner = operation('batch', 14);
  reserve(manager, owner, 'a', 0, 8, 'upper-bound');
  reserve(manager, owner, 'b', 1, 2, 'upper-bound');
  reserve(manager, owner, 'c', 2, 4, 'upper-bound');
  manager.markDispatched('batch', ['a', 'b', 'c']);
  manager.markExecutionEnded('batch');
  manager.reconcile('a', 3);
  manager.reconcile('b', 2);
  manager.reconcile('c', 0);
  assert.equal(manager.reserved(owner), 5);
  assert.equal(manager.snapshot().refundedResultBytes, 9);
  assert.equal(manager.snapshot().resultByteRefunds, 2);
  assert.equal(manager.snapshot().upperBoundResultsReconciled, 3);
  assert.equal(manager.taskForPartition(owner, 2), 'c');
  assert.deepEqual(manager.creditDiagnostics(), {
    unreconciledResultBytes: 0,
    reconciledResultBytes: 5,
  });
  manager.cancelOperation(owner);
  assert.equal(manager.diagnostics().reservations, 0);
});

test('upper-bound cancellation races do not refund discarded successes', () => {
  for (const order of [
    'queued',
    'caller-first',
    'execution-first',
    'reconcile-first',
  ]) {
    const manager = new ResultCreditManager();
    const owner = operation(order, 8);
    reserve(manager, owner, 'a', 0, 8, 'upper-bound');
    if (order !== 'queued') manager.markDispatched('a', ['a']);
    if (order === 'execution-first') manager.markExecutionEnded('a');
    if (order === 'reconcile-first') manager.reconcile('a', 3);
    manager.markCallerSettled('a');
    manager.reconcile('a', 3);
    manager.markExecutionEnded('a');
    manager.markCallerSettled('a');
    assert.equal(manager.reserved(owner), 0);
    assert.equal(
      manager.snapshot().refundedResultBytes,
      order === 'reconcile-first' ? 5 : 0,
    );
    assert.deepEqual(manager.diagnostics(), {
      reservations: 0,
      executions: 0,
      operations: 0,
    });
  }
});

test('invalid upper-bound reconciliation cannot corrupt accounting; exact never refunds', () => {
  const manager = new ResultCreditManager();
  const owner = operation('invalid', 16);
  reserve(manager, owner, 'a', 0, 8, 'upper-bound');
  assert.throws(() => manager.reconcile('a', 3));
  manager.markDispatched('a', ['a']);
  for (const actual of [undefined, -1, 0.5, NaN, Infinity, 2 ** 53, 9]) {
    assert.throws(() => manager.reconcile('a', actual));
    assert.equal(manager.reserved(owner), 8);
  }
  reserve(manager, owner, 'b', 1, 8);
  manager.markDispatched('b', ['b']);
  manager.reconcile('b', 3);
  assert.equal(manager.snapshot().refundedResultBytes, 0);
  manager.releaseAll();
  assert.equal(manager.reserved(owner), 0);
});

test('result credits release queued cancellation immediately', () => {
  const manager = new ResultCreditManager();
  const owner = operation('queued');
  reserve(manager, owner, 'task', 0);
  assert.equal(manager.reserved(owner), 4);
  manager.markCallerSettled('task');
  assert.deepEqual(manager.diagnostics(), {
    reservations: 0,
    executions: 0,
    operations: 0,
  });
});

test('result credits retain running cancellation until execution ends', () => {
  const manager = new ResultCreditManager();
  const owner = operation('running');
  reserve(manager, owner, 'task', 0);
  manager.markDispatched('physical', ['task']);
  manager.markCallerSettled('task');
  assert.equal(manager.reserved(owner), 4);
  assert.equal(manager.diagnostics().reservations, 1);
  manager.markExecutionEnded('physical');
  assert.equal(manager.reserved(owner), 0);
  assert.equal(manager.snapshot().currentReservedResultBytes, 0);
});

test('result credits survive successful buffering until yield', () => {
  const manager = new ResultCreditManager();
  const owner = operation('buffered');
  reserve(manager, owner, 'task', 2);
  manager.markDispatched('physical', ['task']);
  manager.markExecutionEnded('physical');
  assert.equal(manager.taskForPartition(owner, 2), 'task');
  assert.equal(manager.reserved(owner), 4);
  manager.releaseForPartition(owner, 2);
  assert.equal(manager.reserved(owner), 0);
});

test('result credits correlate batch items and cancel operations exactly once', () => {
  const manager = new ResultCreditManager();
  const first = operation('first');
  const second = operation('second');
  reserve(manager, first, 'a', 0, 3);
  reserve(manager, first, 'b', 1, 5);
  reserve(manager, second, 'c', 0, 7);
  manager.markDispatched('batch', ['a', 'b']);
  manager.cancelOperation(first);
  manager.cancelOperation(second);
  assert.equal(manager.snapshot().currentReservedResultBytes, 8);
  manager.markExecutionEnded('batch');
  assert.equal(manager.snapshot().currentReservedResultBytes, 0);
  manager.markExecutionEnded('batch');
  manager.releaseForPartition(first, 0);
  assert.equal(manager.diagnostics().reservations, 0);
});

test('result credits enforce capacity and release all physical owners', () => {
  const manager = new ResultCreditManager();
  const owner = operation('capacity', 4);
  reserve(manager, owner, 'a', 0, 4);
  assert.throws(
    () => reserve(manager, owner, 'b', 1, 1),
    PjsResultCapacityError,
  );
  manager.markDispatched('physical', ['a']);
  manager.releaseAll();
  assert.deepEqual(manager.diagnostics(), {
    reservations: 0,
    executions: 0,
    operations: 0,
  });
});
