import assert from 'node:assert/strict';
import test from 'node:test';
import { PjsResultCapacityError } from '../dist/errors/index.js';
import { ResultCreditManager } from '../dist/results/credit.js';

function operation(id, capacity = 16) {
  return { id, resultByteCapacity: capacity };
}

function reserve(manager, owner, taskId, partitionIndex, bytes = 4) {
  manager.reserve(taskId, owner, partitionIndex, bytes, {
    operationId: owner.id,
    partitionIndex,
    rangeStart: partitionIndex,
    rangeEnd: partitionIndex + 1,
  });
}

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
