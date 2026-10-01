import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PjsBinaryResultContractError,
  PjsResultCapacityError,
  PjsCancelledError,
  PjsTimeoutError,
  PjsWorkerError,
  PjsRuntime,
  PjsTaskRegistry,
} from '../dist/index.js';
import { isHostMessage, isWorkerMessage } from '../dist/workers/protocol.js';

function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const task = registry.register(
    'upper-bound',
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
const range = (end = 1) => ({ start: 0, end, grainSize: 1 });
const input = (partition, extra = {}) => ({ input: { partition, ...extra } });
const options = (maximum = 8, capacity = maximum, extra = {}) => ({
  experimentalMaxResultBytes: maximum,
  experimentalMaxReservedResultBytes: capacity,
  ...extra,
});
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'condition reached');
    await delay(2);
  }
}
async function collect(stream) {
  const results = [];
  for await (const value of stream) results.push(value);
  return results;
}
async function clean(runtime) {
  await until(
    () =>
      runtime.stats().workers.busy === 0 &&
      runtime.stats().streamResults.currentReservedResultBytes === 0,
  );
  assert.deepEqual(runtime.resultCredits.diagnostics(), {
    reservations: 0,
    executions: 0,
    operations: 0,
  });
}
function releaseGate(gate) {
  Atomics.store(new Int32Array(gate), 1, 1);
  Atomics.notify(new Int32Array(gate), 1);
}

test('upper-bound wire fields are explicit, exclusive, and validated for batches', () => {
  const execute = { type: 'execute', taskId: 'a', taskName: 't', input: 0 };
  for (const bytes of [0, 8])
    assert.equal(
      isHostMessage({
        ...execute,
        resultByteContract: { mode: 'upper-bound', bytes },
      }),
      true,
    );
  for (const contract of [
    null,
    {},
    { mode: 'exact', bytes: 8 },
    { mode: 'upper-bound', bytes: -1 },
    { mode: 'upper-bound', bytes: 0.5 },
    { mode: 'upper-bound', bytes: NaN },
    { mode: 'upper-bound', bytes: Infinity },
    { mode: 'upper-bound', bytes: 2 ** 53 },
  ])
    assert.equal(
      isHostMessage({ ...execute, resultByteContract: contract }),
      false,
    );
  assert.equal(
    isHostMessage({
      ...execute,
      expectedResultBytes: 8,
      resultByteContract: { mode: 'upper-bound', bytes: 8 },
    }),
    false,
  );
  const batch = {
    type: 'executeBatch',
    batchId: 'b',
    taskName: 't',
    items: [
      {
        taskId: 'a',
        input: 0,
        resultByteContract: { mode: 'upper-bound', bytes: 8 },
      },
      { taskId: 'b', input: 0, expectedResultBytes: 8 },
    ],
  };
  assert.equal(isHostMessage(batch), true);
  batch.items[0].expectedResultBytes = 8;
  assert.equal(isHostMessage(batch), false);
  const success = {
    type: 'success',
    taskId: 'a',
    output: new Uint8Array(0),
    executionMs: 1,
  };
  for (const actualResultBytes of [0, 8])
    assert.equal(isWorkerMessage({ ...success, actualResultBytes }), true);
  for (const actualResultBytes of [-1, 0.5, NaN, Infinity, 2 ** 53]) {
    const item = { ...success, actualResultBytes };
    assert.equal(isWorkerMessage(item), false);
    assert.equal(
      isWorkerMessage({
        type: 'batchResult',
        batchId: 'b',
        items: [item],
        skippedTaskIds: [],
        executionMs: 1,
      }),
      false,
    );
  }
});

test('upper-bound kinds, subviews, zero, clone, and transfer preserve visible bytes', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  await runtime.ready();
  let refunded = 0;
  let reconciled = 0;
  for (const move of [false, true])
    for (const [kind, bytes] of [
      ['arraybuffer', 13],
      ['uint8', 17],
      ['float64', 24],
      ['buffer', 19],
      ['dataview', 11],
      ['subview', 23],
      ['uint8', 0],
    ])
      for (const slack of [0, 8]) {
        const values = await collect(
          runtime.streamRange(
            task,
            range(),
            (partition) => input(partition, { kind, bytes, move }),
            options(bytes + slack),
          ),
        );
        assert.equal(values.length, 1);
        assert.equal(values[0].output.byteLength, bytes);
        refunded += slack;
        reconciled++;
      }
  assert.equal(runtime.stats().streamResults.refundedResultBytes, refunded);
  assert.equal(
    runtime.stats().streamResults.upperBoundResultsReconciled,
    reconciled,
  );
  await clean(runtime);
});

test('refund resumes admission before consumer yield and slow buffers retain actual credit', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  await runtime.ready();
  const calls = [];
  const stream = runtime.streamRange(
    task,
    range(8),
    (partition) => input(partition, { bytes: 1 }),
    options(
      (partition) => {
        calls.push(partition.index);
        return 8;
      },
      10,
      { experimentalMaxBufferedResults: 4 },
    ),
  );
  await until(() => runtime.stats().streamResults.buffered === 3);
  const stats = runtime.stats();
  assert.equal(stats.streamResults.yielded, 0);
  assert.equal(stats.streamResults.currentReservedResultBytes, 3);
  assert.equal(stats.streamResults.refundedResultBytes, 21);
  assert.equal(stats.activeOperations[0].bufferedKnownPayloadBytes, 3);
  assert.equal(stats.activeOperations[0].reservedResultBytes, 3);
  assert.equal(stats.streamResults.resultByteReservationWaits > 0, true);
  assert.deepEqual(calls, [0, 1, 2, 3]);
  assert.equal((await collect(stream)).length, 8);
  assert.equal(new Set(calls).size, 8);
  assert.equal(calls.length, 8);
  await clean(runtime);
});

test('zero actual refunds all maximum but count capacity still blocks production', async (t) => {
  const { runtime, task } = setup(t, { workers: 2 });
  await runtime.ready();
  const stream = runtime.streamRange(
    task,
    range(8),
    (partition) => input(partition, { bytes: 0 }),
    options(8, 16, { experimentalMaxBufferedResults: 2 }),
  );
  await until(() => runtime.stats().streamResults.buffered === 2);
  assert.equal(runtime.stats().partitions.admitted, 2);
  assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
  assert.equal(runtime.resultCredits.diagnostics().reservations, 2);
  assert.equal((await collect(stream)).length, 8);
  await clean(runtime);
});

test('upper-bound violations fail compactly without a refund or successful payload', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  await runtime.ready();
  const cases = [
    { kind: 'uint8', bytes: 16 },
    { kind: 'uint8', bytes: 16, move: true },
    { kind: 'object', bytes: 8 },
    { kind: 'nested', bytes: 8 },
    { kind: 'shared', bytes: 8 },
    { kind: 'shared-buffer', bytes: 8 },
    { kind: 'uint8', bytes: 8, detached: true },
    { kind: 'arraybuffer', bytes: 8, detached: true },
    { kind: 'arraybuffer', bytes: 0, detached: true },
    { kind: 'dataview', bytes: 8, detached: true },
  ];
  for (const entry of cases) {
    await assert.rejects(
      collect(
        runtime.streamRange(
          task,
          range(),
          (partition) => input(partition, entry),
          options(),
        ),
      ),
      PjsBinaryResultContractError,
    );
    await clean(runtime);
  }
  const stats = runtime.stats().streamResults;
  assert.equal(stats.produced, 0);
  assert.equal(stats.refundedResultBytes, 0);
  assert.equal(stats.upperBoundContractFailures, cases.length);
  assert.equal(stats.binaryResultContractFailures, cases.length);
});

test('invalid, ambiguous, asynchronous, throwing, and impossible maxima fail before input', async (t) => {
  const { runtime, task } = setup(t);
  await runtime.ready();
  let factories = 0;
  const factory = (partition) => {
    factories++;
    return input(partition, { bytes: 0 });
  };
  for (const maximum of [-1, 0.5, NaN, Infinity, 2 ** 53])
    for (const declaration of [maximum, () => maximum])
      await assert.rejects(
        collect(
          runtime.streamRange(task, range(), factory, options(declaration, 16)),
        ),
        PjsBinaryResultContractError,
      );
  for (const declaration of [
    async () => 1,
    () => {
      throw new Error('declaration');
    },
  ])
    await assert.rejects(
      collect(
        runtime.streamRange(task, range(), factory, options(declaration, 8)),
      ),
      PjsBinaryResultContractError,
    );
  for (const bad of [
    options(8, 8, { experimentalResultBytes: 8 }),
    { experimentalMaxResultBytes: 8 },
    { experimentalMaxReservedResultBytes: 8 },
  ])
    await assert.rejects(
      collect(runtime.streamRange(task, range(), factory, bad)),
      TypeError,
    );
  await assert.rejects(
    collect(runtime.streamRange(task, range(), factory, options(32, 16))),
    PjsResultCapacityError,
  );
  assert.equal(factories, 0);
  assert.equal(runtime.stats().tasks.accepted, 0);
  await clean(runtime);
});

test('upper-bound declaration can submit ordinary work reentrantly', async (t) => {
  const { runtime, task } = setup(t);
  await runtime.ready();
  const ordinary = [];
  const values = await collect(
    runtime.streamRange(
      task,
      range(3),
      (partition) => input(partition, { bytes: 3 }),
      options((partition) => {
        ordinary.push(runtime.run(task, { partition, bytes: 1 }));
        return 8;
      }, 16),
    ),
  );
  assert.equal(values.length, 3);
  assert.equal((await Promise.all(ordinary)).length, 3);
  await clean(runtime);
});

test('batches refund logical successes and stop on first or middle failure', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  await runtime.ready();
  for (const failIndex of [-1, 0, 1, 3]) {
    const counter = new SharedArrayBuffer(16);
    const before = runtime.stats().streamResults.refundedResultBytes;
    const stream = runtime.streamRange(
      task,
      range(4),
      (partition) =>
        input(partition, {
          bytes: partition.index,
          move: true,
          counter,
          fail: partition.index === failIndex,
        }),
      options(8, 32, {
        experimentalDispatchBatchSize: 4,
        experimentalMaxBufferedResults: 4,
      }),
    );
    if (failIndex < 0) assert.equal((await collect(stream)).length, 4);
    else await assert.rejects(collect(stream));
    const executed = Array.from(new Int32Array(counter));
    assert.deepEqual(
      executed,
      Array.from({ length: 4 }, (_, i) =>
        Number(failIndex < 0 || i <= failIndex),
      ),
    );
    const successes = failIndex < 0 ? 4 : failIndex;
    assert.equal(
      runtime.stats().streamResults.refundedResultBytes - before,
      Array.from({ length: successes }, (_, i) => 8 - i).reduce(
        (a, b) => a + b,
        0,
      ),
    );
    await clean(runtime);
  }
});

test('queued and running cancellation preserve maximum until the correct terminal event', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  await runtime.ready();
  for (const queued of [true, false]) {
    const gate = new SharedArrayBuffer(8);
    const blocker = queued
      ? runtime.run(task, {
          partition: { index: 0, start: 0, end: 1 },
          bytes: 0,
          gate,
        })
      : undefined;
    if (queued) await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
    const stream = runtime.streamRange(
      task,
      range(),
      (partition) =>
        input(partition, {
          bytes: 1,
          gate: queued ? undefined : gate,
          move: true,
        }),
      options(),
    );
    await until(
      () => runtime.stats().streamResults.currentReservedResultBytes === 8,
    );
    if (!queued) await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
    await stream.return();
    assert.equal(
      runtime.stats().streamResults.currentReservedResultBytes,
      queued ? 0 : 8,
    );
    releaseGate(gate);
    await blocker;
    await clean(runtime);
    assert.equal(runtime.stats().streamResults.refundedResultBytes, 0);
  }
});

test('timeout before dispatch and while running never reconciles a discarded success', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  await runtime.ready();
  for (const queued of [true, false]) {
    const gate = new SharedArrayBuffer(8);
    const blocker = queued
      ? runtime.run(task, {
          partition: { index: 0, start: 0, end: 1 },
          bytes: 0,
          gate,
        })
      : undefined;
    if (queued) await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
    const stream = runtime.streamRange(
      task,
      range(),
      (partition) =>
        input(partition, { bytes: 1, gate: queued ? undefined : gate }),
      options(8, 8, { timeout: 100 }),
    );
    if (!queued) await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
    await assert.rejects(collect(stream), PjsTimeoutError);
    assert.equal(
      runtime.stats().streamResults.currentReservedResultBytes,
      queued ? 0 : 8,
    );
    releaseGate(gate);
    await blocker;
    await clean(runtime);
    assert.equal(runtime.stats().streamResults.refundedResultBytes, 0);
  }
});

test('consumer break, throw, return, and iterator throw release buffered actual credit', async (t) => {
  const { runtime, task } = setup(t);
  await runtime.ready();
  for (const kind of ['break', 'throw', 'return', 'iterator-throw']) {
    const stream = runtime.streamRange(
      task,
      range(8),
      (partition) => input(partition, { bytes: 1 }),
      options(8, 32, { experimentalMaxBufferedResults: 4 }),
    );
    await until(() => runtime.stats().streamResults.buffered === 4);
    if (kind === 'break') {
      for await (const value of stream) {
        void value;
        break;
      }
    } else if (kind === 'throw')
      await assert.rejects(async () => {
        for await (const value of stream) {
          void value;
          throw new Error('consumer');
        }
      }, /consumer/);
    else if (kind === 'return') await stream.return();
    else await assert.rejects(stream.throw(new Error('iterator')), /iterator/);
    await clean(runtime);
  }
});

test('crash, fatal restart exhaustion, and ordinary failure release without refund', async (t) => {
  for (const extra of [{ fail: true }, { crash: true }]) {
    const { runtime, task } = setup(t, { workers: 1 });
    await runtime.ready();
    await assert.rejects(
      collect(
        runtime.streamRange(
          task,
          range(),
          (partition) => input(partition, { bytes: 1, ...extra }),
          options(),
        ),
      ),
    );
    await clean(runtime);
    assert.equal(runtime.stats().streamResults.refundedResultBytes, 0);
  }
  const { runtime, task } = setup(t, { workers: 1, maxRestarts: 0 });
  await runtime.ready();
  await assert.rejects(
    collect(
      runtime.streamRange(
        task,
        range(),
        (partition) => input(partition, { bytes: 1, crash: true }),
        options(),
      ),
    ),
    PjsWorkerError,
  );
  await until(() => runtime.stats().state === 'failed');
  await runtime.shutdown();
  await clean(runtime);
});

test('graceful and non-draining shutdown clean reconciled and unreconciled owners', async (t) => {
  for (const drain of [true, false]) {
    const { runtime, task } = setup(t, { workers: 1 });
    await runtime.ready();
    const gate = drain ? undefined : new SharedArrayBuffer(8);
    const stream = runtime.streamRange(
      task,
      range(3),
      (partition) => input(partition, { bytes: 1, gate }),
      options(8, 16),
    );
    if (drain) {
      const consuming = collect(stream);
      const stopping = runtime.shutdown();
      assert.equal((await consuming).length, 3);
      await stopping;
    } else {
      await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
      const rejected = assert.rejects(collect(stream), PjsCancelledError);
      await runtime.shutdown({ drain: false });
      await rejected;
    }
    await clean(runtime);
  }
});

test('a credit-blocked maximum does not starve another stream or ordinary work', async (t) => {
  const { runtime, task } = setup(t);
  await runtime.ready();
  const blocked = runtime.streamRange(
    task,
    range(3),
    (partition) => input(partition, { bytes: 1 }),
    options(8, 8, { experimentalMaxBufferedResults: 3 }),
  );
  await until(() => runtime.stats().streamResults.buffered === 1);
  const small = await collect(
    runtime.streamRange(
      task,
      range(3),
      (partition) => input(partition, { bytes: 0 }),
      options(1, 1),
    ),
  );
  assert.equal(small.length, 3);
  assert.equal(
    (
      await runtime.run(task, {
        partition: { index: 0, start: 0, end: 1 },
        bytes: 1,
      })
    ).byteLength,
    1,
  );
  await blocked.return();
  await clean(runtime);
});

test('non-draining shutdown discards reconciled buffered actuals without counting release as refund', async (t) => {
  const { runtime, task } = setup(t);
  await runtime.ready();
  const stream = runtime.streamRange(
    task,
    range(8),
    (partition) => input(partition, { bytes: 1, move: true }),
    options(8, 32, { experimentalMaxBufferedResults: 4 }),
  );
  await until(() => runtime.stats().streamResults.buffered === 4);
  assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 4);
  assert.equal(runtime.stats().streamResults.refundedResultBytes, 28);
  await runtime.shutdown({ drain: false });
  await assert.rejects(stream.next(), PjsCancelledError);
  assert.equal(runtime.stats().streamResults.refundedResultBytes, 28);
  await clean(runtime);
});
