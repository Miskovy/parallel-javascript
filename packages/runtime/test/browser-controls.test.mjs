import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MessageProgressReporter,
  encodeProgress,
  utf8Bytes,
} from '../dist/workers/progress.js';
import { ResultCreditManager } from '../dist/results/credit.js';
import { validateInitialization } from '../dist/browser/protocol.js';
import {
  browserCapabilities,
  PjsRuntime,
  PjsTaskRegistry,
} from '../dist/browser/index.js';

test('message progress permits require the exact frame, coalesce and close idempotently', () => {
  const sent = [];
  const reporter = new MessageProgressReporter((message) => sent.push(message));
  const frame = (taskId, sequence) => ({
    type: 'progress',
    correlationId: 'batch',
    taskId,
    sequence,
    payload: '{}',
    bytes: 2,
  });
  reporter.report(frame('first', 1));
  for (let sequence = 2; sequence <= 10000; sequence++)
    reporter.report(frame('second', sequence));
  assert.equal(sent.length, 1);
  reporter.wake('second', 1);
  reporter.wake('first', 2);
  reporter.wake();
  assert.equal(sent.length, 1);
  reporter.wake('first', 1);
  assert.deepEqual(
    sent.map(({ taskId, sequence }) => [taskId, sequence]),
    [
      ['first', 1],
      ['second', 10000],
    ],
  );
  reporter.report(frame('third', 1));
  reporter.wake('first', 1); // Duplicate acknowledgement cannot grant another permit.
  assert.equal(sent.length, 2);
  reporter.close();
  reporter.close();
  reporter.wake('second', 10000);
  assert.equal(reporter.report(frame('third', 2)), false);
  assert.equal(sent.length, 2);
});

test('portable progress bounds reject before serialization and count UTF-8 without copying', () => {
  let invoked = false;
  const value = {
    get huge() {
      invoked = true;
      return 'x'.repeat(1000000);
    },
  };
  assert.equal(encodeProgress(value), undefined);
  assert.equal(invoked, false);
  assert.equal(encodeProgress('x'.repeat(20000)), undefined);
  for (const value of ['abc', '𝄞', 'é', '\ud800', 'a'.repeat(17000)]) {
    const bytes = new globalThis.TextEncoder().encode(value).byteLength;
    if (bytes > 16384) assert.ok(utf8Bytes(value) > 16384);
    else assert.equal(utf8Bytes(value), bytes);
  }
});

test('browser entry is inert outside Window and rejects incompatible initialization', () => {
  assert.equal(browserCapabilities().windowHost, false);
  assert.throws(
    () => new PjsRuntime({ registry: new PjsTaskRegistry() }),
    /Window/,
  );
  const valid = {
    type: 'initialize',
    browserProtocol: 1,
    data: { version: 2, tasks: [], concurrency: 1 },
    sharedMemory: false,
  };
  assert.equal(validateInitialization(valid), valid);
  for (const value of [
    null,
    { ...valid, browserProtocol: 0 },
    { ...valid, sharedMemory: undefined },
    {
      ...valid,
      data: {
        version: 2,
        tasks: [{ id: 'x', module: 'file:///task.js', exportName: 'default' }],
      },
    },
  ])
    assert.throws(() => validateInitialization(value));
});

test('browser abandonment cannot run on Node or during posting and never marks completion', () => {
  assert.throws(() => new ResultCreditManager().abandonExecution('id'), /Node/);
  const manager = new ResultCreditManager(true, true);
  const operation = { id: 'operation', resultByteCapacity: 4 };
  manager.reserve('task', operation, 0, 4, {
    operationId: operation.id,
    partitionIndex: 0,
    rangeStart: 0,
    rangeEnd: 1,
  });
  manager.markDispatching('execution', ['task']);
  manager.markCallerSettled('task');
  assert.throws(() => manager.abandonExecution('execution'), /posting/);
  assert.equal(manager.reserved(operation), 4);
  manager.markDispatched('execution', ['task']);
  manager.abandonExecution('execution');
  manager.abandonExecution('execution');
  assert.equal(manager.reserved(operation), 0);
  assert.equal(manager.executions.size, 0);
  manager.assertInvariants('test');
});
