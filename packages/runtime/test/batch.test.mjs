import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsTaskError,
  PjsWorkerError,
  PjsQueueFullError,
  PjsCancelledError,
  PjsTimeoutError,
  PjsSerializationError,
  sharedReadonly,
} from '../dist/index.js';

const module = new URL('./fixtures/partition-tasks.mjs', import.meta.url);
function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const task = registry.register('range', module, 'range');
  const runtime = new PjsRuntime({
    registry,
    workers: 2,
    maxQueue: 16,
    ...options,
  });
  t.after(() => runtime.shutdown({ drain: false }));
  return { runtime, task };
}
const range = { start: 0, end: 16, grainSize: 1 };
const options = { experimentalDispatchBatchSize: 4 };
const input = (partition) => ({ input: { partition } });
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'condition reached');
    await delay(2);
  }
}
function release(gate) {
  const control = new Int32Array(gate);
  Atomics.store(control, 1, 1);
  Atomics.notify(control, 1);
}

test('batch size one preserves v0.4 logical output and message semantics', async (t) => {
  const { runtime, task } = setup(t, { workers: 4, maxQueue: 4 });
  const output = await runtime.partitionRange(task, range, input, {
    experimentalDispatchBatchSize: 1,
  });
  assert.deepEqual(
    output.flatMap((result) => result.indices),
    Array.from({ length: 16 }, (_, i) => i),
  );
  const stats = runtime.stats();
  assert.equal(stats.tasks.completed, 16);
  assert.equal(stats.dispatch.executeMessages, 16);
  assert.equal(stats.dispatch.resultMessages, 16);
  assert.equal(stats.dispatch.batchedExecuteMessages, 0);
  assert.equal(stats.dispatch.averageLogicalTasksPerExecute, 1);
});

test('multiple logical items retain order across reversed physical completion', async (t) => {
  const { runtime, task } = setup(t, { workers: 2, maxQueue: 8 });
  const output = await runtime.partitionRange(
    task,
    { start: 0, end: 12, grainSize: 1 },
    (partition) => ({
      input: { partition, ms: partition.index < 4 ? 15 : 0 },
    }),
    options,
  );
  assert.deepEqual(
    output.map((result) => result.partition.index),
    Array.from({ length: 12 }, (_, i) => i),
  );
  assert.equal(runtime.stats().dispatch.executeMessages, 3);
  assert.equal(runtime.stats().dispatch.logicalPartitions, 12);
});

for (const failureIndex of [0, 1, 3])
  test(`batch stops after logical failure at item ${failureIndex}`, async (t) => {
    const { runtime, task } = setup(t, { workers: 1, maxQueue: 4 });
    await runtime.ready();
    const counter = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 4);
    await assert.rejects(
      runtime.partitionRange(
        task,
        { start: 0, end: 8, grainSize: 1 },
        (partition) => ({
          input: {
            partition,
            counter,
            fail: partition.index === failureIndex,
          },
        }),
        options,
      ),
      (error) =>
        error instanceof PjsTaskError &&
        error.partitionIndex === failureIndex &&
        error.rangeStart === failureIndex,
    );
    assert.deepEqual(
      [...new Int32Array(counter)],
      Array.from({ length: 4 }, (_, i) => (i <= failureIndex ? 1 : 0)),
    );
    const stats = runtime.stats();
    assert.equal(stats.tasks.completed, failureIndex);
    assert.equal(stats.tasks.failed, 1);
    assert.equal(stats.tasks.cancelled, 3 - failureIndex);
    assert.equal(stats.operations.failed, 1);
    assert.equal(stats.dispatch.executeMessages, 1);
    assert.equal(stats.dispatch.resultMessages, 1);
  });

test('shared and cloned inputs batch while transferred inputs reject before detachment', async (t) => {
  const { runtime, task } = setup(t, { workers: 2, maxQueue: 8 });
  const shared = sharedReadonly(new Float64Array([2, 3, 5]));
  const output = await runtime.partitionRange(
    task,
    range,
    (partition) => ({ input: { partition, shared, metadata: { ok: true } } }),
    options,
  );
  assert.ok(output.every((result) => result.shared && result.sum === 10));
  const bytes = new Uint8Array([7]);
  await assert.rejects(
    runtime.partitionRange(
      task,
      range,
      (partition) => ({
        input: { partition, data: bytes },
        transferList: [bytes.buffer],
      }),
      options,
    ),
    PjsSerializationError,
  );
  assert.equal(bytes.byteLength, 1);
  assert.equal(runtime.stats().workers.failures, 0);
});

test('batched private outputs can transfer back together', async (t) => {
  const { runtime, task } = setup(t, { workers: 2, maxQueue: 8 });
  const output = await runtime.partitionRange(
    task,
    { start: 0, end: 8, grainSize: 1 },
    (partition) => ({ input: { partition, move: true } }),
    options,
  );
  assert.deepEqual(
    output.map((result) => result.values[0]),
    Array.from({ length: 8 }, (_, i) => i),
  );
  assert.equal(new Set(output.map((result) => result.values.buffer)).size, 8);
});

test('combined output serialization failure rejects once and leaves replacement unnecessary', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 4 });
  await assert.rejects(
    runtime.partitionRange(
      task,
      { start: 0, end: 4, grainSize: 1 },
      (partition) => ({
        input: { partition, badOutput: partition.index === 3 },
      }),
      options,
    ),
    (error) =>
      error instanceof PjsSerializationError && error.partitionIndex === 0,
  );
  assert.equal(runtime.stats().operations.failed, 1);
  assert.equal(runtime.stats().workers.failures, 0);
  assert.equal(
    (await runtime.partitionRange(task, { ...range, end: 4 }, input, options))
      .length,
    4,
  );
});

test('queued parent cancellation removes one weighted FIFO batch', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 4 });
  await runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const active = runtime.run(task, {
    partition: { index: 0, start: 0, end: 1 },
    gate,
  });
  const controller = new AbortController();
  const parent = runtime.partitionRange(task, range, input, {
    ...options,
    signal: controller.signal,
  });
  await until(() => runtime.stats().queue.size === 4);
  assert.equal(runtime.stats().tasks.pending, 5);
  controller.abort();
  await assert.rejects(parent, PjsCancelledError);
  assert.equal(runtime.stats().queue.size, 0);
  assert.equal(runtime.stats().partitions.cancelled, 4);
  release(gate);
  await active;
});

for (const reason of ['abort', 'timeout'])
  test(`${reason} during a batch settles callers but the full batch retains occupancy`, async (t) => {
    const { runtime, task } = setup(t, { workers: 1, maxQueue: 0 });
    await runtime.ready();
    const gate = new SharedArrayBuffer(8);
    const controller = new AbortController();
    const parent = runtime.partitionRange(
      task,
      { start: 0, end: 8, grainSize: 1 },
      (partition) => ({ input: { partition, gate } }),
      reason === 'abort'
        ? { ...options, signal: controller.signal }
        : { ...options, timeout: 100 },
    );
    await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
    if (reason === 'abort') controller.abort();
    await assert.rejects(
      parent,
      reason === 'abort' ? PjsCancelledError : PjsTimeoutError,
    );
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(runtime.stats().tasks.cancelled, 4);
    release(gate);
    await until(() => runtime.stats().workers.busy === 0);
    assert.equal(Atomics.load(new Int32Array(gate), 0), 4);
  });

test('worker crash during a batch fails without retry and replacement remains usable', async (t) => {
  const { runtime, task } = setup(t, {
    workers: 1,
    maxQueue: 4,
    maxRestarts: 2,
  });
  await runtime.ready();
  const before = runtime.stats().workers.details[0].id;
  await assert.rejects(
    runtime.partitionRange(
      task,
      { start: 0, end: 8, grainSize: 1 },
      (partition) => ({
        input: { partition, crash: partition.index === 1 },
      }),
      options,
    ),
    (error) => error instanceof PjsWorkerError && error.partitionIndex === 0,
  );
  const output = await runtime.partitionRange(
    task,
    { start: 0, end: 4, grainSize: 1 },
    input,
    options,
  );
  assert.equal(output.length, 4);
  assert.notEqual(runtime.stats().workers.details[0].id, before);
  assert.equal(runtime.stats().workers.restarts, 1);
  assert.equal(runtime.stats().tasks.failed, 1);
});

test('malformed batch response fails its worker and operation safely', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 4 });
  await assert.rejects(
    runtime.partitionRange(
      task,
      { start: 0, end: 4, grainSize: 1 },
      (partition) => ({ input: { partition, badProtocol: true } }),
      options,
    ),
    PjsWorkerError,
  );
  assert.equal(
    (await runtime.partitionRange(task, { ...range, end: 4 }, input, options))
      .length,
    4,
  );
  assert.equal(runtime.stats().workers.restarts, 1);
});

test('graceful shutdown drains ungenerated batches', async (t) => {
  const { runtime, task } = setup(t, { workers: 2, maxQueue: 0 });
  const parent = runtime.partitionRange(task, range, input, options);
  const shutdown = runtime.shutdown();
  assert.equal((await parent).length, 16);
  await shutdown;
  assert.equal(runtime.stats().operations.completed, 1);
  assert.equal(runtime.stats().dispatch.executeMessages, 4);
});

test('non-draining shutdown cancels active and ungenerated batches', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 4 });
  await runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const parent = runtime.partitionRange(
    task,
    range,
    (partition) => ({ input: { partition, gate } }),
    options,
  );
  await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
  const check = assert.rejects(parent, PjsCancelledError);
  await runtime.shutdown({ drain: false });
  await check;
  assert.equal(runtime.stats().operations.cancelled, 1);
});

test('reentrant factory cannot steal a worker reserved for a batch', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 0 });
  await runtime.ready();
  const checks = [];
  const output = await runtime.partitionRange(
    task,
    { start: 0, end: 8, grainSize: 1 },
    (partition) => {
      checks.push(
        assert.rejects(runtime.run(task, { partition }), PjsQueueFullError),
      );
      return input(partition);
    },
    options,
  );
  await Promise.all(checks);
  assert.equal(output.length, 8);
  assert.equal(runtime.stats().dispatch.executeMessages, 2);
});

test('concurrent parents and ordinary work preserve logical and physical accounting', async (t) => {
  const { runtime, task } = setup(t, { workers: 2, maxQueue: 100 });
  await runtime.ready();
  const parents = Array.from({ length: 4 }, () =>
    runtime.partitionRange(task, range, input, options),
  );
  const ordinary = Array.from({ length: 4 }, (_, index) =>
    runtime.run(task, {
      partition: { index, start: index, end: index + 1 },
    }),
  );
  const output = await Promise.all([...parents, ...ordinary]);
  assert.ok(output.every(Boolean));
  await runtime.shutdown();
  const stats = runtime.stats();
  assert.equal(stats.operations.completed, 4);
  assert.equal(stats.tasks.accepted, 68);
  assert.equal(stats.tasks.completed, 68);
  assert.equal(stats.partitions.admitted, 64);
  assert.equal(stats.dispatch.logicalTasks, 68);
  assert.equal(stats.dispatch.logicalPartitions, 64);
  assert.equal(stats.dispatch.executeMessages, 20);
  assert.equal(stats.dispatch.resultMessages, 20);
  assert.equal(stats.tasks.pending, 0);
});
