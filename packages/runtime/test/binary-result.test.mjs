import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PjsBinaryResultContractError,
  PjsCancelledError,
  PjsQueueFullError,
  PjsResultCapacityError,
  PjsRuntime,
  PjsTaskRegistry,
  PjsTimeoutError,
  PjsWorkerError,
} from '../dist/index.js';
import { isHostMessage, isWorkerMessage } from '../dist/workers/protocol.js';

function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const task = registry.register(
    'binary-result',
    new URL('./fixtures/partition-tasks.mjs', import.meta.url),
    'binaryResult',
  );
  const runtime = new PjsRuntime({
    registry,
    workers: 2,
    maxQueue: 8,
    ...options,
  });
  t.after(() => runtime.shutdown({ drain: false }));
  return { runtime, task };
}

async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'condition reached');
    await delay(2);
  }
}

function strictOptions(resultBytes, capacity, extra = {}) {
  return {
    experimentalResultBytes: resultBytes,
    experimentalMaxReservedResultBytes: capacity,
    ...extra,
  };
}

function input(partition, extra = {}) {
  return { input: { partition, ...extra } };
}

function iterator(stream) {
  return stream[Symbol.asyncIterator]();
}

test('binary protocol fields validate single, batch, legacy, and failure messages', () => {
  assert.equal(
    isHostMessage({
      type: 'execute',
      taskId: 'one',
      taskName: 'task',
      input: null,
      expectedResultBytes: 8,
    }),
    true,
  );
  assert.equal(
    isHostMessage({
      type: 'executeBatch',
      batchId: 'batch',
      taskName: 'task',
      items: [
        { taskId: 'one', input: null, expectedResultBytes: 4 },
        { taskId: 'two', input: null, expectedResultBytes: 8 },
      ],
    }),
    true,
  );
  assert.equal(
    isHostMessage({
      type: 'execute',
      taskId: 'legacy',
      taskName: 'task',
      input: null,
    }),
    true,
  );
  assert.equal(
    isHostMessage({
      type: 'execute',
      taskId: 'bad',
      taskName: 'task',
      input: null,
      expectedResultBytes: -1,
    }),
    false,
  );
  assert.equal(
    isWorkerMessage({
      type: 'failure',
      taskId: 'one',
      kind: 'binaryContract',
      error: { name: 'Error', message: 'mismatch' },
      executionMs: 1,
      binaryContract: {
        declaredBytes: 8,
        actualBytes: 16,
        actualType: 'Uint8Array',
      },
    }),
    true,
  );
  assert.equal(
    isWorkerMessage({
      type: 'failure',
      taskId: 'one',
      kind: 'binaryContract',
      error: { name: 'Error', message: 'missing detail' },
      executionMs: 1,
    }),
    false,
  );
});

test('strict streams accept direct owned binary kinds, zero length, and subviews', async (t) => {
  const { runtime, task } = setup(t);
  await runtime.ready();
  for (const [kind, bytes] of [
    ['arraybuffer', 13],
    ['uint8', 17],
    ['float64', 24],
    ['buffer', 19],
    ['dataview', 11],
    ['subview', 23],
    ['uint8', 0],
  ]) {
    const values = [];
    for await (const { output } of runtime.streamRange(
      task,
      { start: 0, end: 1, grainSize: 1 },
      (partition) => input(partition, { kind, bytes }),
      strictOptions(bytes, bytes),
    ))
      values.push(output);
    assert.equal(values.length, 1);
    assert.equal(values[0].byteLength, bytes);
  }
  assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
});

test('clone, transfer, uneven declarations, and physical batching retain logical byte weights', async (t) => {
  const { runtime, task } = setup(t, { workers: 4 });
  await runtime.ready();
  for (const move of [false, true]) {
    const widths = [];
    for await (const { partition, output } of runtime.streamRange(
      task,
      { start: 0, end: 10, grainSize: 3 },
      (partition) =>
        input(partition, {
          bytes: (partition.end - partition.start) * 8,
          kind: 'uint8',
          move,
        }),
      strictOptions((partition) => (partition.end - partition.start) * 8, 80, {
        experimentalDispatchBatchSize: move ? 1 : 4,
      }),
    )) {
      widths.push([partition.index, output.byteLength]);
    }
    assert.deepEqual(
      widths.sort((a, b) => a[0] - b[0]),
      [
        [0, 24],
        [1, 24],
        [2, 24],
        [3, 8],
      ],
    );
  }
  assert.ok(runtime.stats().dispatch.batchedExecuteMessages > 0);
  assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
});

test('count and byte credits compose and variable declarations wait for consumer release', async (t) => {
  const { runtime, task } = setup(t, { workers: 4 });
  await runtime.ready();
  const sizes = [4, 16, 64, 32];
  const stream = runtime.streamRange(
    task,
    { start: 0, end: sizes.length, grainSize: 1 },
    (partition) =>
      input(partition, { bytes: sizes[partition.index], kind: 'uint8' }),
    strictOptions((partition) => sizes[partition.index], 80, {
      experimentalMaxBufferedResults: 4,
      experimentalDispatchBatchSize: 4,
    }),
  );
  await until(
    () => runtime.stats().streamResults.knownBufferedPayloadBytes === 20,
  );
  let active = runtime.stats().activeOperations[0];
  assert.equal(active.reservedResultBytes, 20);
  assert.equal(active.bufferedKnownPayloadBytes, 20);
  assert.equal(active.resultByteCapacity, 80);
  const received = [];
  for await (const { output } of stream) received.push(output.byteLength);
  assert.deepEqual(
    received.sort((a, b) => a - b),
    [4, 16, 32, 64],
  );
  const stats = runtime.stats().streamResults;
  assert.ok(stats.peakReservedResultBytes <= 80);
  assert.ok(stats.resultByteReservationWaits >= 1);
  assert.equal(stats.currentReservedResultBytes, 0);
});

test('impossible and invalid declarations fail before factory or worker execution', async (t) => {
  const { runtime, task } = setup(t);
  await runtime.ready();
  let factories = 0;
  const impossible = runtime.streamRange(
    task,
    { start: 0, end: 1, grainSize: 1 },
    (partition) => {
      factories++;
      return input(partition, { bytes: 16 });
    },
    strictOptions(16, 8),
  );
  await assert.rejects(async () => {
    for await (const value of impossible) void value;
  }, PjsResultCapacityError);
  assert.equal(factories, 0);

  for (const declaration of [-1, 0.5, Number.NaN, Infinity, 2 ** 53]) {
    const invalid = runtime.streamRange(
      task,
      { start: 0, end: 1, grainSize: 1 },
      (partition) => input(partition, { bytes: 0 }),
      strictOptions(() => declaration, 8),
    );
    await assert.rejects(async () => {
      for await (const value of invalid) void value;
    }, PjsBinaryResultContractError);
  }
  const invalidFixed = runtime.streamRange(
    task,
    { start: 0, end: 1, grainSize: 1 },
    (partition) => input(partition, { bytes: 0 }),
    strictOptions(-1, 8),
  );
  await assert.rejects(async () => {
    for await (const value of invalidFixed) void value;
  }, PjsBinaryResultContractError);
  assert.equal(runtime.stats().tasks.accepted, 0);
  assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
});

test('worker rejects wrong, nested, shared, detached, over, and undersized results before success transport', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  await runtime.ready();
  const cases = [
    { kind: 'object', actual: 8, declared: 8 },
    { kind: 'nested', actual: 8, declared: 8 },
    { kind: 'shared', actual: 8, declared: 8 },
    { kind: 'shared-buffer', actual: 8, declared: 8 },
    { kind: 'uint8', actual: 8, declared: 8, detached: true },
    { kind: 'uint8', actual: 16, declared: 8 },
    { kind: 'uint8', actual: 8, declared: 16 },
    { kind: 'uint8', actual: 16, declared: 8, move: true },
  ];
  for (const entry of cases) {
    const stream = runtime.streamRange(
      task,
      { start: 0, end: 1, grainSize: 1 },
      (partition) =>
        input(partition, {
          kind: entry.kind,
          bytes: entry.actual,
          detached: entry.detached,
          move: entry.move,
        }),
      strictOptions(entry.declared, 32),
    );
    let error;
    await assert.rejects(
      async () => {
        for await (const value of stream) void value;
      },
      (cause) => {
        error = cause;
        return cause instanceof PjsBinaryResultContractError;
      },
    );
    assert.equal(error.declaredBytes, entry.declared);
    assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
  }
  const stats = runtime.stats().streamResults;
  assert.equal(stats.produced, 0);
  assert.equal(stats.binaryResultContractFailures, cases.length);
});

test('queued cancellation releases immediately while running cancellation holds credit until execution ends', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 4 });
  await runtime.ready();
  const blockerGate = new SharedArrayBuffer(8);
  const blocker = runtime.run(task, {
    partition: { index: 0, start: 0, end: 1 },
    bytes: 1,
    gate: blockerGate,
  });
  await until(() => Atomics.load(new Int32Array(blockerGate), 0) === 1);
  const queued = iterator(
    runtime.streamRange(
      task,
      { start: 0, end: 1, grainSize: 1 },
      (partition) => input(partition, { bytes: 32 }),
      strictOptions(32, 32),
    ),
  );
  await until(
    () => runtime.stats().streamResults.currentReservedResultBytes === 32,
  );
  await queued.return();
  assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
  Atomics.store(new Int32Array(blockerGate), 1, 1);
  Atomics.notify(new Int32Array(blockerGate), 1);
  await blocker;

  const runningGate = new SharedArrayBuffer(8);
  const running = iterator(
    runtime.streamRange(
      task,
      { start: 0, end: 1, grainSize: 1 },
      (partition) => input(partition, { bytes: 32, gate: runningGate }),
      strictOptions(32, 32),
    ),
  );
  await until(() => Atomics.load(new Int32Array(runningGate), 0) === 1);
  await running.return();
  assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 32);
  Atomics.store(new Int32Array(runningGate), 1, 1);
  Atomics.notify(new Int32Array(runningGate), 1);
  await until(
    () => runtime.stats().streamResults.currentReservedResultBytes === 0,
  );
});

test('timeout, crash, and first batch failure clean every reservation exactly once', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  await runtime.ready();
  const timed = runtime.streamRange(
    task,
    { start: 0, end: 2, grainSize: 1 },
    (partition) => input(partition, { bytes: 16, ms: 30 }),
    { ...strictOptions(16, 32), timeout: 5 },
  );
  await assert.rejects(async () => {
    for await (const value of timed) void value;
  }, PjsTimeoutError);
  await until(
    () => runtime.stats().streamResults.currentReservedResultBytes === 0,
  );

  const crashed = runtime.streamRange(
    task,
    { start: 0, end: 1, grainSize: 1 },
    (partition) => input(partition, { bytes: 16, crash: true }),
    strictOptions(16, 16),
  );
  await assert.rejects(async () => {
    for await (const value of crashed) void value;
  }, PjsWorkerError);
  await until(
    () => runtime.stats().streamResults.currentReservedResultBytes === 0,
  );

  const failedBatch = runtime.streamRange(
    task,
    { start: 0, end: 4, grainSize: 1 },
    (partition) =>
      input(partition, {
        bytes: 8,
        fail: partition.index === 1,
      }),
    strictOptions(8, 32, { experimentalDispatchBatchSize: 4 }),
  );
  await assert.rejects(async () => {
    for await (const value of failedBatch) void value;
  });
  assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
});

test('consumer failure and weighted head-of-line pressure do not leak or starve another stream', async (t) => {
  const { runtime, task } = setup(t, { workers: 2 });
  await runtime.ready();
  let yielded = 0;
  await assert.rejects(async () => {
    for await (const value of runtime.streamRange(
      task,
      { start: 0, end: 8, grainSize: 1 },
      (partition) => input(partition, { bytes: 8, move: true }),
      strictOptions(8, 16, { experimentalMaxBufferedResults: 2 }),
    )) {
      void value;
      if (++yielded === 2) throw new Error('consumer failed');
    }
  }, /consumer failed/);
  await until(
    () => runtime.stats().streamResults.currentReservedResultBytes === 0,
  );

  const sizes = [4, 8];
  const blocked = iterator(
    runtime.streamRange(
      task,
      { start: 0, end: 2, grainSize: 1 },
      (partition) => input(partition, { bytes: sizes[partition.index], ms: 5 }),
      strictOptions((partition) => sizes[partition.index], 8, {
        experimentalMaxBufferedResults: 2,
      }),
    ),
  );
  await until(() =>
    runtime
      .stats()
      .activeOperations.some(
        (operation) =>
          operation.resultByteCapacity === 8 &&
          operation.bufferedKnownPayloadBytes === 4,
      ),
  );
  const small = iterator(
    runtime.streamRange(
      task,
      { start: 0, end: 1, grainSize: 1 },
      (partition) => input(partition, { bytes: 1 }),
      strictOptions(1, 1),
    ),
  );
  assert.equal((await small.next()).value.output.byteLength, 1);
  await small.return();
  await blocked.return();
  await until(
    () => runtime.stats().streamResults.currentReservedResultBytes === 0,
  );
});

test('strict streams retain parent saturation and count-only streams remain available', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 0 });
  await runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const first = iterator(
    runtime.streamRange(
      task,
      { start: 0, end: 1, grainSize: 1 },
      (partition) => input(partition, { bytes: 8, gate }),
      strictOptions(8, 8),
    ),
  );
  await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
  const saturated = runtime.streamRange(
    task,
    { start: 0, end: 1, grainSize: 1 },
    (partition) => input(partition, { bytes: 8 }),
    strictOptions(8, 8),
  );
  await assert.rejects(async () => {
    for await (const value of saturated) void value;
  }, PjsQueueFullError);
  await first.return();
  Atomics.store(new Int32Array(gate), 1, 1);
  Atomics.notify(new Int32Array(gate), 1);
  await until(
    () => runtime.stats().streamResults.currentReservedResultBytes === 0,
  );

  const ordinary = [];
  for await (const { output } of runtime.streamRange(
    task,
    { start: 0, end: 2, grainSize: 1 },
    (partition) => input(partition, { bytes: 3, kind: 'object' }),
    { experimentalMaxBufferedResults: 1 },
  ))
    ordinary.push(output);
  assert.equal(ordinary.length, 2);
  assert.equal(runtime.stats().streamResults.unknownBufferedResults, 0);
});

test('graceful and terminating shutdown preserve reservation ownership', async (t) => {
  const first = setup(t, { workers: 1 });
  const drained = first.runtime.streamRange(
    first.task,
    { start: 0, end: 2, grainSize: 1 },
    (partition) => input(partition, { bytes: 8 }),
    strictOptions(8, 16),
  );
  const consuming = (async () => {
    let count = 0;
    for await (const value of drained) {
      void value;
      count++;
    }
    return count;
  })();
  const graceful = first.runtime.shutdown();
  assert.equal(await consuming, 2);
  await graceful;
  assert.equal(
    first.runtime.stats().streamResults.currentReservedResultBytes,
    0,
  );

  const second = setup(t, { workers: 1 });
  await second.runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const stopped = second.runtime.streamRange(
    second.task,
    { start: 0, end: 1, grainSize: 1 },
    (partition) => input(partition, { bytes: 64, gate }),
    strictOptions(64, 64),
  );
  const pending = assert.rejects(async () => {
    for await (const value of stopped) void value;
  }, PjsCancelledError);
  await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
  await second.runtime.shutdown({ drain: false });
  await pending;
  assert.equal(
    second.runtime.stats().streamResults.currentReservedResultBytes,
    0,
  );
});
